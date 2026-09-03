import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { hashPassword, newSalt } from '$lib/server/crypto/kdf';
import { ensureWorkerRule } from '$lib/server/mail/email-routing';
import {
	findAccountByEmail,
	findAccountByLocalPart,
	findInviteByHash,
	createAccount,
	consumeInvite,
	ensureFolders,
	uuid
} from '$lib/server/db/queries';
import { signSession, registerSession } from '$lib/server/auth/session';
import { auditAsync } from '$lib/server/audit/log';
import { verifyTurnstile } from '$lib/server/auth/turnstile';
import { reviewRegistration } from '$lib/server/auth/abuse-review';

export const load: PageServerLoad = async ({ platform, url }) => {
	return {
		domain: platform?.env?.MAIL_DOMAIN || 'krsz.in',
		hasInvites: true,
		// Open registration is available whenever a Turnstile site key is
		// configured — that's the hard gate against scripted signups, so we
		// treat its presence as the feature flag.
		openRegistration: Boolean(platform?.env?.TURNSTILE_SITE_KEY),
		turnstileSiteKey: platform?.env?.TURNSTILE_SITE_KEY || '',
		inviteCode: url.searchParams.get('invite') || ''
	};
};

const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/;
const NOTE_MAX_LENGTH = 500;
const OPEN_LOCAL_PART_MIN_LENGTH = 5;

export const actions: Actions = {
	default: async ({ request, platform, cookies, url, getClientAddress }) => {
		if (!platform?.env?.JWT_SECRET) {
			return fail(500, { error: 'JWT_SECRET is not configured', localPart: '', displayName: '', inviteCode: '' });
		}

		const data = await request.formData();
		const localPart = String(data.get('local_part') || '').trim().toLowerCase();
		const displayName = String(data.get('display_name') || '').trim();
		const password = String(data.get('password') || '');
		const inviteCode = String(data.get('invite_code') || '').trim();
		const domain = String(data.get('domain') || 'krsz.in').toLowerCase();
		// Open-registration-only fields — absent/ignored on the invite path.
		const openMode = String(data.get('mode') || '') === 'open';
		const note = String(data.get('note') || '').trim().slice(0, NOTE_MAX_LENGTH);
		const turnstileToken = String(data.get('cf-turnstile-response') || '');

		let ip: string | null = null;
		try { ip = getClientAddress(); } catch { /* not resolvable, skip */ }

		if (!localPart || !password) {
			return fail(400, {
				error: 'Local part and password are required',
				localPart,
				displayName,
				inviteCode
			});
		}
		if (!LOCAL_PART_RE.test(localPart)) {
			return fail(400, {
				error: 'Local part must be 2-31 chars, lowercase letters, digits, dot, underscore, or dash',
				localPart,
				displayName,
				inviteCode
			});
		}
		// Open registration only: a longer minimum makes cheap enumeration/land-grab
		// signups (single letters, two-char combos) less attractive. Invite-issued
		// addresses can still be short — an admin already chose to hand one out.
		if (openMode && localPart.length < OPEN_LOCAL_PART_MIN_LENGTH) {
			return fail(400, {
				error: `Local part must be at least ${OPEN_LOCAL_PART_MIN_LENGTH} characters for public registration`,
				localPart,
				displayName,
				inviteCode
			});
		}
		if (password.length < 6) {
			return fail(400, {
				error: 'Password must be at least 6 characters',
				localPart,
				displayName,
				inviteCode
			});
		}

		let invite: Awaited<ReturnType<typeof findInviteByHash>> | null = null;
		let codeHash = '';

		if (openMode) {
			if (!platform.env.TURNSTILE_SITE_KEY || !platform.env.TURNSTILE_SECRET_KEY) {
				return fail(500, { error: 'Open registration is not configured', localPart, displayName, inviteCode });
			}
			const human = await verifyTurnstile({
				secretKey: platform.env.TURNSTILE_SECRET_KEY,
				token: turnstileToken,
				ip
			});
			if (!human) {
				return fail(400, { error: 'Verification failed — please retry the checkbox challenge', localPart, displayName, inviteCode });
			}
		} else {
			if (!inviteCode) {
				return fail(400, { error: 'Invite code is required', localPart, displayName, inviteCode });
			}
			codeHash = await sha256Hex(inviteCode);
			invite = await findInviteByHash(platform.env.DB, codeHash);
			if (!invite) {
				return fail(401, { error: 'Invalid invite code', localPart, displayName, inviteCode });
			}
			if (invite.expires_at && invite.expires_at < Date.now()) {
				return fail(401, { error: 'Invite code expired', localPart, displayName, inviteCode });
			}
			if (invite.consumed_at) {
				return fail(409, { error: 'Invite code already used', localPart, displayName, inviteCode });
			}
			if (invite.local_part && invite.local_part.toLowerCase() !== localPart) {
				return fail(400, {
					error: `This invite is for local part "${invite.local_part}"`,
					localPart,
					displayName,
					inviteCode
				});
			}
		}

		const email = `${localPart}@${domain}`;
		if (await findAccountByEmail(platform.env.DB, email)) {
			return fail(409, { error: 'That address is already taken', localPart, displayName, inviteCode });
		}
		if (await findAccountByLocalPart(platform.env.DB, localPart)) {
			return fail(409, { error: 'That local part is already taken', localPart, displayName, inviteCode });
		}

		let registrationStatus: 'active' | 'pending' = 'active';
		let reviewMeta: Record<string, unknown> | null = null;

		if (openMode) {
			const userAgent = request.headers.get('user-agent');
			const result = await reviewRegistration({
				db: platform.env.DB,
				geminiApiKey: platform.env.GEMINI_API_KEY,
				geminiModel: platform.env.GEMINI_MODEL,
				localPart,
				note,
				ip,
				userAgent,
				cf: platform.cf
			});
			reviewMeta = {
				verdict: result.verdict,
				reason: result.reason,
				signals: result.signals,
				...('errorDetail' in result ? { errorDetail: result.errorDetail } : {})
			};

			if (result.verdict === 'block') {
				auditAsync(platform.context, platform.env.DB, {
					actorEmail: email,
					event: 'register_blocked',
					detail: { via: 'open', reason: result.reason, signals: result.signals },
					ip
				});
				// Generic, non-specific error — don't tell an abuser exactly why
				// they were blocked or that a decision engine is involved.
				return fail(400, { error: 'Registration could not be completed. Please try again later.', localPart, displayName, inviteCode });
			}
			registrationStatus = result.verdict === 'review' ? 'pending' : 'active';
		}

		const salt = newSalt();
		const passwordHash = await hashPassword(password, salt);

		const id = uuid();
		await createAccount(platform.env.DB, {
			id,
			localPart,
			email,
			displayName: displayName || localPart,
			passwordHash,
			passwordSalt: salt,
			passwordIters: 100_000,
			role: 'user',
			// Invite-only registration lands on R2 (historical default); open
			// registration defaults new accounts to the S3 backend instead —
			// see storage_backend in migration 0004.
			storageBackend: openMode ? 'minio_s3' : 'r2',
			registrationStatus,
			registrationVia: openMode ? 'open' : 'invite',
			registrationIp: ip,
			registrationNote: openMode ? note || null : null,
			registrationMeta: reviewMeta
		});
		await ensureFolders(platform.env.DB, id);
		if (!openMode && invite) {
			await consumeInvite(platform.env.DB, codeHash, id);
		}

		if (registrationStatus === 'pending') {
			// Reuse the same SESSIONS `disabled:` gate admin disable/enable already
			// uses — no changes needed to hooks.server.ts's login-time check.
			await platform.env.SESSIONS.put(`disabled:${id}`, '1');
		}

		auditAsync(platform.context, platform.env.DB, {
			accountId: id,
			actorEmail: email,
			event: 'register',
			detail: { via: openMode ? 'open' : 'invite', status: registrationStatus, review: reviewMeta },
			ip
		});

		// Create the Email Routing worker rule so this address can receive mail.
		// If this fails the account still exists; the admin can re-create the rule
		// from the dashboard. Log but don't block signup.
		const ruleResult = await ensureWorkerRule(email, platform.env);
		if (!ruleResult.ok) {
			console.warn('[register] could not create Email Routing rule:', ruleResult.error);
		}

		if (registrationStatus === 'pending') {
			// Don't sign the account in — it's gated until an admin approves it.
			return { pending: true, email };
		}

		const { token, sid } = await signSession(
			{ accountId: id, email, role: 'user' },
			platform.env.JWT_SECRET
		);
		await registerSession(platform.env.SESSIONS, id, sid, token, request.headers.get('user-agent'));

		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});

		throw redirect(303, '/inbox');
	}
};

async function sha256Hex(s: string) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
