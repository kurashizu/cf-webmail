import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { hashPassword, constantTimeEqual, newSalt } from '$lib/server/crypto/kdf';
import { findAccountByEmail, findAccountById } from '$lib/server/db/queries';
import { signSession, registerSession } from '$lib/server/auth/session';

export const load: PageServerLoad = async ({ url }) => {
	return { next: url.searchParams.get('next') || '/inbox' };
};

export const actions: Actions = {
	default: async ({ request, platform, cookies, url }) => {
		if (!platform?.env?.JWT_SECRET) {
			return fail(500, { error: 'JWT_SECRET is not configured', email: '' });
		}

		const data = await request.formData();
		const email = String(data.get('email') || '').trim().toLowerCase();
		const password = String(data.get('password') || '');
		const next = String(data.get('next') || '/inbox');

		if (!email || !password) {
			return fail(400, { error: 'Please enter email and password', email });
		}

		const account = await findAccountByEmail(platform.env.DB, email);
		if (!account) {
			return fail(401, { error: 'Email or password incorrect', email });
		}

		try {
			const saltBytes = toBytes(account.password_salt);
			const got = await hashPassword(password, saltBytes, Number(account.password_iters || 100_000));
			if (!constantTimeEqual(got, String(account.password_hash))) {
				return fail(401, { error: 'Email or password incorrect', email });
			}
		} catch {
			return fail(401, { error: 'Email or password incorrect', email });
		}

		const disabled = await platform.env.SESSIONS.get(`disabled:${account.id}`);
		if (disabled === '1') {
			return fail(403, { error: 'This account has been disabled. Contact the administrator.', email });
		}

		const token = await signSession(
			{ accountId: String(account.id), email: String(account.email), role: account.role === 'admin' ? 'admin' : 'user' },
			platform.env.JWT_SECRET
		);
		await registerSession(platform.env.SESSIONS, String(account.id), token);

		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});

		const verified = await findAccountById(platform.env.DB, String(account.id));
		if (!verified) {
			return fail(500, { error: 'Account state inconsistent', email });
		}

		throw redirect(303, next.startsWith('/') ? next : '/inbox');
	}
};

function toBytes(v: unknown) {
	if (v instanceof Uint8Array) return v;
	if (v instanceof ArrayBuffer) return new Uint8Array(v);
	if (v && typeof v === 'object') {
		const obj = v as Record<string, unknown> & { byteLength?: number; length?: number };
		const len = obj.byteLength ?? obj.length ?? 16;
		const out = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			out[i] = obj[String(i)] != null ? Number(obj[String(i)]) : 0;
		}
		return out;
	}
	throw new Error('Cannot coerce value to Uint8Array');
}
