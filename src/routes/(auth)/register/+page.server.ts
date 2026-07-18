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

export const load: PageServerLoad = async ({ platform }) => {
	return {
		domain: platform?.env?.MAIL_DOMAIN || 'krsz.in',
		hasInvites: true
	};
};

const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/;

export const actions: Actions = {
	default: async ({ request, platform, cookies, url }) => {
		if (!platform?.env?.JWT_SECRET) {
			return fail(500, { error: 'JWT_SECRET is not configured' });
		}

		const data = await request.formData();
		const localPart = String(data.get('local_part') || '').trim().toLowerCase();
		const displayName = String(data.get('display_name') || '').trim();
		const password = String(data.get('password') || '');
		const inviteCode = String(data.get('invite_code') || '').trim();
		const domain = String(data.get('domain') || 'krsz.in').toLowerCase();
		const role = String(data.get('role') || 'user').toLowerCase();

		if (!localPart || !password || !inviteCode) {
			return fail(400, {
				error: 'Local part, password, and invite code are required',
				localPart,
				displayName
			});
		}
		if (!LOCAL_PART_RE.test(localPart)) {
			return fail(400, {
				error: 'Local part must be 2-31 chars, lowercase letters, digits, dot, underscore, or dash',
				localPart,
				displayName
			});
		}
		if (password.length < 6) {
			return fail(400, {
				error: 'Password must be at least 6 characters',
				localPart,
				displayName
			});
		}

		// Verify invite.
		const codeHash = await sha256Hex(inviteCode);
		const invite = await findInviteByHash(platform.env.DB, codeHash);
		if (!invite) {
			return fail(401, { error: 'Invalid invite code', localPart, displayName });
		}
		if (invite.expires_at && invite.expires_at < Date.now()) {
			return fail(401, { error: 'Invite code expired', localPart, displayName });
		}
		if (invite.consumed_at) {
			return fail(409, { error: 'Invite code already used', localPart, displayName });
		}
		if (invite.local_part && invite.local_part.toLowerCase() !== localPart) {
			return fail(400, {
				error: `This invite is for local part "${invite.local_part}"`,
				localPart,
				displayName
			});
		}

		const email = `${localPart}@${domain}`;
		if (await findAccountByEmail(platform.env.DB, email)) {
			return fail(409, { error: 'That address is already taken', localPart, displayName });
		}
		if (await findAccountByLocalPart(platform.env.DB, localPart)) {
			return fail(409, { error: 'That local part is already taken', localPart, displayName });
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
			role: role === 'admin' ? 'admin' : 'user'
		});
		await ensureFolders(platform.env.DB, id);
				await consumeInvite(platform.env.DB, codeHash, id);

				// Create the Email Routing worker rule so this address can receive mail.
				// If this fails the account still exists; the admin can re-create the rule
				// from the dashboard. Log but don't block signup.
				const ruleResult = await ensureWorkerRule(email, platform.env);
				if (!ruleResult.ok) {
					console.warn('[register] could not create Email Routing rule:', ruleResult.error);
				}

		const token = await signSession(
			{ accountId: id, email, role: role === 'admin' ? 'admin' : 'user' },
			platform.env.JWT_SECRET
		);
		await registerSession(platform.env.SESSIONS, id, token);

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
