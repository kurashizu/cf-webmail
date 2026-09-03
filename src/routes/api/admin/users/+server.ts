import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import {
	deleteAccountData,
	findAccountById,
	listAccountStorageKeys,
	listAccounts,
	setRegistrationStatus,
	updateAccountByAdmin,
	updateAccountPassword
} from '$lib/server/db/queries';
import { hashPassword, newSalt } from '$lib/server/crypto/kdf';
import { MAX_QUOTA_BYTES, MIN_QUOTA_BYTES, MAX_QUOTA_MESSAGES, MAX_DAILY_SEND_QUOTA } from '$lib/server/db/storage';
import { getStorageForAccount, isStorageConfigured, STORAGE_BACKENDS } from '$lib/server/storage';
import { auditAsync } from '$lib/server/audit/log';

const PASSWORD_ITERATIONS = 100_000;

function requireAdmin(locals: App.Locals) {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');
	return locals.user;
}

async function adminCount(db: D1Database) {
	const row = await db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE role = 'admin'").first<{ count: number }>();
	return Number(row?.count || 0);
}

function parseRegistrationMeta(raw: unknown): Record<string, unknown> | null {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function todayDayNumber() {
	return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
}

async function serializeAccounts(env: App.Platform['env']) {
	const accounts = await listAccounts(env.DB);
	const today = todayDayNumber();
	return Promise.all(
		accounts.map(async (account: any) => ({
			...account,
			registration_meta: parseRegistrationMeta(account.registration_meta),
			// daily_send_count only resets lazily on the next reserve, not
			// proactively at midnight — a stale count from a previous day must
			// read as 0 here rather than showing yesterday's number.
			daily_send_used: Number(account.daily_send_day) === today ? Number(account.daily_send_count || 0) : 0,
			disabled: (await env.SESSIONS.get(`disabled:${account.id}`)) === '1',
			has_session: Boolean(await env.SESSIONS.get(`session:${account.id}`))
		}))
	);
}

export const GET: RequestHandler = async ({ locals, platform }) => {
	requireAdmin(locals);
	return json({ ok: true, users: await serializeAccounts(platform!.env) });
};

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const admin = requireAdmin(locals);
	const env = platform!.env;
	const body = (await request.json().catch(() => ({}))) as {
			id?: string;
			action?: string;
			display_name?: string;
			role?: string;
			password?: string;
			quota_bytes?: number;
			quota_messages?: number;
			daily_send_quota?: number;
			storage_backend?: string;
		};
	if (!body.id || !body.action) throw error(400, 'Missing user action');
	const account: any = await findAccountById(env.DB, body.id);
	if (!account) throw error(404, 'User not found');
	const isSelf = body.id === admin.accountId;
	let auditDetail: Record<string, unknown> | null = null;

	switch (body.action) {
		case 'disable':
			if (isSelf) throw error(400, 'You cannot disable your own account.');
			if (account.role === 'admin' && await adminCount(env.DB) <= 1) throw error(409, 'The last administrator cannot be disabled.');
			await env.SESSIONS.put(`disabled:${body.id}`, '1');
			await env.SESSIONS.delete(`session:${body.id}`);
			break;
		case 'enable':
			await env.SESSIONS.delete(`disabled:${body.id}`);
			// A pending open-registration account is "disabled" via the same KV
			// flag as a normal admin-disable — clearing that flag here must also
			// clear registration_status, or the account would end up fully able
			// to sign in while still labeled 'pending' everywhere else in the
			// admin UI (and re-disabling it later would incorrectly re-trip the
			// "not pending" guard on approve/reject). Rejected registrations are
			// deleted outright, not disabled, so there's nothing to re-enable.
			if (account.registration_status === 'pending') {
				await setRegistrationStatus(env.DB, body.id, 'active');
			}
			break;
		case 'revoke_sessions':
			if (isSelf) throw error(400, 'Use Sign out to end your current session.');
			await env.SESSIONS.delete(`session:${body.id}`);
			break;
		case 'update': {
			const displayName = String(body.display_name || '').trim();
			const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;
			if (displayName.length > 80) throw error(400, 'Display name must be 80 characters or fewer.');
			if (!role) throw error(400, 'Invalid role.');
			if (isSelf && role !== 'admin') throw error(400, 'You cannot remove your own administrator role.');
			if (account.role === 'admin' && role !== 'admin' && await adminCount(env.DB) <= 1) {
				throw error(409, 'The last administrator cannot be demoted.');
			}
			await updateAccountByAdmin(env.DB, body.id, displayName, role);
			if (account.role !== role) await env.SESSIONS.delete(`session:${body.id}`);
			auditDetail = { displayName, previousRole: account.role, role };
			break;
		}
		case 'reset_password': {
					if (isSelf) throw error(400, 'Change your own password from Settings.');
					const password = String(body.password || '');
					if (password.length < 6) throw error(400, 'Password must be at least 6 characters.');
					if (password.length > 256) throw error(400, 'Password is too long.');
					const salt = newSalt();
					const hash = await hashPassword(password, salt, PASSWORD_ITERATIONS);
					await updateAccountPassword(env.DB, body.id, hash, salt, PASSWORD_ITERATIONS);
					await env.SESSIONS.delete(`session:${body.id}`);
					break;
				}
				case 'set_quota': {
					// 0 means unlimited for storage/message quotas. Anything else must
					// fit within caps. daily_send_quota has no "unlimited" convention —
					// it's the one guard directly protecting the shared Resend account
					// limit, so an admin can raise it high but not turn it off entirely.
					const qBytes = Number(body.quota_bytes);
					const qMessages = Number(body.quota_messages);
					const qDailySend = Number(body.daily_send_quota);
					if (!Number.isFinite(qBytes) || qBytes < 0 || qBytes > MAX_QUOTA_BYTES) {
						throw error(400, `Storage quota must be between 0 (unlimited) and ${MAX_QUOTA_BYTES} bytes.`);
					}
					if (qBytes !== 0 && qBytes < MIN_QUOTA_BYTES) {
						throw error(400, `Storage quota must be at least ${MIN_QUOTA_BYTES} bytes (or 0 for unlimited).`);
					}
					if (!Number.isFinite(qMessages) || qMessages < 0 || qMessages > MAX_QUOTA_MESSAGES) {
						throw error(400, `Message quota must be between 0 (unlimited) and ${MAX_QUOTA_MESSAGES}.`);
					}
					if (!Number.isFinite(qDailySend) || qDailySend < 0 || qDailySend > MAX_DAILY_SEND_QUOTA) {
						throw error(400, `Daily send quota must be between 0 (unlimited) and ${MAX_DAILY_SEND_QUOTA}.`);
					}
					await env.DB
						.prepare(
							'UPDATE accounts SET quota_bytes = ?, quota_messages = ?, daily_send_quota = ?, updated_at = ? WHERE id = ?'
						)
						.bind(qBytes, qMessages, qDailySend, Date.now(), body.id)
						.run();
					auditDetail = {
						previousQuotaBytes: Number(account.quota_bytes ?? 0),
						quotaBytes: qBytes,
						previousQuotaMessages: Number(account.quota_messages ?? 0),
						quotaMessages: qMessages,
						previousDailySendQuota: Number(account.daily_send_quota ?? 0),
						dailySendQuota: qDailySend
					};
					break;
				}
				case 'set_storage_backend': {
					// Only changes where NEW writes for this account land — existing
					// message bodies/attachments already written under the old backend
					// are not migrated, so old mail stays readable from wherever it was
					// originally stored (storage.js resolves per-account, not globally).
					const backend = String(body.storage_backend || '');
					if (!STORAGE_BACKENDS.includes(backend)) {
						throw error(400, `Storage backend must be one of: ${STORAGE_BACKENDS.join(', ')}.`);
					}
					if (!isStorageConfigured(backend, env)) {
						throw error(409, `The ${backend} backend is not configured on this deployment.`);
					}
					await env.DB
						.prepare('UPDATE accounts SET storage_backend = ?, updated_at = ? WHERE id = ?')
						.bind(backend, Date.now(), body.id)
						.run();
					auditDetail = { previousBackend: account.storage_backend || 'r2', backend };
					break;
				}
			case 'approve_registration': {
				if (account.registration_status !== 'pending') throw error(409, 'This account is not pending review.');
				await setRegistrationStatus(env.DB, body.id, 'active');
				await env.SESSIONS.delete(`disabled:${body.id}`);
				auditDetail = { registrationNote: account.registration_note || null };
				break;
			}
			case 'reject_registration': {
				if (account.registration_status !== 'pending') throw error(409, 'This account is not pending review.');
				// A rejected signup never had a chance to receive mail or send
				// anything — there's nothing worth keeping, so remove it outright
				// rather than leaving a disabled row behind (same cleanup as the
				// full account-delete path below: storage objects, D1 rows, KV).
				const keys = await listAccountStorageKeys(env.DB, body.id);
				const storage = getStorageForAccount(account, env);
				if (storage && keys.length) {
					for (let offset = 0; offset < keys.length; offset += 1000) {
						await storage.delete(keys.slice(offset, offset + 1000));
					}
				}
				await deleteAccountData(env.DB, body.id);
				await env.SESSIONS.delete(`session:${body.id}`);
				await env.SESSIONS.delete(`disabled:${body.id}`);
				auditDetail = { registrationNote: account.registration_note || null };
				auditAsync(platform!.context, env.DB, {
					accountId: admin.accountId,
					actorEmail: admin.email,
					event: `admin.${body.action}`,
					targetAccountId: body.id,
					targetEmail: account.email,
					detail: auditDetail
				});
				return json({ ok: true, deleted: body.id });
			}
		default:
			throw error(400, 'Invalid user action');
	}

	auditAsync(platform!.context, env.DB, {
		accountId: admin.accountId,
		actorEmail: admin.email,
		event: `admin.${body.action}`,
		targetAccountId: body.id,
		targetEmail: account.email,
		detail: auditDetail
	});

	const updated: any = await findAccountById(env.DB, body.id);
		const today = todayDayNumber();
		return json({
			ok: true,
			user: updated ? {
				id: updated.id,
				display_name: updated.display_name,
				role: updated.role,
				quota_bytes: Number(updated.quota_bytes ?? 0),
				quota_messages: Number(updated.quota_messages ?? 0),
				storage_used_bytes: Number(updated.storage_used_bytes ?? 0),
				storage_backend: updated.storage_backend || 'r2',
				registration_status: updated.registration_status || 'active',
				registration_via: updated.registration_via || 'invite',
				registration_note: updated.registration_note || null,
				daily_send_quota: Number(updated.daily_send_quota ?? 0),
				daily_send_used: Number(updated.daily_send_day) === today ? Number(updated.daily_send_count || 0) : 0,
				disabled: (await env.SESSIONS.get(`disabled:${body.id}`)) === '1',
				has_session: Boolean(await env.SESSIONS.get(`session:${body.id}`))
			} : null
		});
	};

export const DELETE: RequestHandler = async ({ locals, platform, request }) => {
	const admin = requireAdmin(locals);
	const env = platform!.env;
	const body = (await request.json().catch(() => ({}))) as { id?: string; confirmation?: string };
	if (!body.id) throw error(400, 'Missing user id');
	if (body.id === admin.accountId) throw error(400, 'You cannot delete your own account');
	const account: any = await findAccountById(env.DB, body.id);
	if (!account) throw error(404, 'User not found');
	if (body.confirmation !== account.email) throw error(400, 'Enter the full email address to confirm deletion.');
	if (account.role === 'admin' && await adminCount(env.DB) <= 1) throw error(409, 'The last administrator cannot be deleted.');

	const keys = await listAccountStorageKeys(env.DB, body.id);
	const storage = getStorageForAccount(account, env);
	if (storage && keys.length) {
		for (let offset = 0; offset < keys.length; offset += 1000) {
			await storage.delete(keys.slice(offset, offset + 1000));
		}
	}
	await deleteAccountData(env.DB, body.id);
	await env.SESSIONS.delete(`session:${body.id}`);
	await env.SESSIONS.delete(`disabled:${body.id}`);

	auditAsync(platform!.context, env.DB, {
		accountId: admin.accountId,
		actorEmail: admin.email,
		event: 'admin.delete_user',
		targetAccountId: body.id,
		targetEmail: account.email
	});

	return json({ ok: true, deleted: body.id });
};
