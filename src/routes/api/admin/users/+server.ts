import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import {
	deleteAccountData,
	findAccountById,
	listAccountStorageKeys,
	listAccounts,
	updateAccountByAdmin,
	updateAccountPassword
} from '$lib/server/db/queries';
import { hashPassword, newSalt } from '$lib/server/crypto/kdf';

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

async function serializeAccounts(env: App.Platform['env']) {
	const accounts = await listAccounts(env.DB);
	return Promise.all(
		accounts.map(async (account: any) => ({
			...account,
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
	};
	if (!body.id || !body.action) throw error(400, 'Missing user action');
	const account: any = await findAccountById(env.DB, body.id);
	if (!account) throw error(404, 'User not found');
	const isSelf = body.id === admin.accountId;

	switch (body.action) {
		case 'disable':
			if (isSelf) throw error(400, 'You cannot disable your own account.');
			if (account.role === 'admin' && await adminCount(env.DB) <= 1) throw error(409, 'The last administrator cannot be disabled.');
			await env.SESSIONS.put(`disabled:${body.id}`, '1');
			await env.SESSIONS.delete(`session:${body.id}`);
			break;
		case 'enable':
			await env.SESSIONS.delete(`disabled:${body.id}`);
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
		default:
			throw error(400, 'Invalid user action');
	}

	const updated: any = await findAccountById(env.DB, body.id);
	return json({
		ok: true,
		user: updated ? {
			id: updated.id,
			display_name: updated.display_name,
			role: updated.role,
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
	if (env.MAIL && keys.length) {
		for (let offset = 0; offset < keys.length; offset += 1000) {
			await env.MAIL.delete(keys.slice(offset, offset + 1000));
		}
	}
	await deleteAccountData(env.DB, body.id);
	await env.SESSIONS.delete(`session:${body.id}`);
	await env.SESSIONS.delete(`disabled:${body.id}`);
	return json({ ok: true, deleted: body.id });
};
