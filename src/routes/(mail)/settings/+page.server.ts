import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { constantTimeEqual, hashPassword, newSalt } from '$lib/server/crypto/kdf';
import {
	findAccountById,
	updateAccountPassword,
	updateAccountProfile
} from '$lib/server/db/queries';
import { registerSession, signSession } from '$lib/server/auth/session';

const PASSWORD_ITERATIONS = 100_000;

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) throw redirect(303, '/login');
	const account = await findAccountById(platform!.env.DB, locals.user.accountId);
	if (!account) throw redirect(303, '/logout');

	return {
		displayName: account.display_name || '',
		createdAt: account.created_at
	};
};

export const actions: Actions = {
	profile: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/login');
		const data = await request.formData();
		const displayName = String(data.get('display_name') || '').trim();

		if (displayName.length > 80) {
			return fail(400, {
				action: 'profile',
				error: 'Display name must be 80 characters or fewer.',
				displayName
			});
		}

		await updateAccountProfile(platform!.env.DB, locals.user.accountId, displayName);
		return { action: 'profile', success: 'Profile updated.' };
	},

	password: async ({ request, locals, platform, cookies, url }) => {
		if (!locals.user) throw redirect(303, '/login');
		const data = await request.formData();
		const currentPassword = String(data.get('current_password') || '');
		const newPassword = String(data.get('new_password') || '');
		const confirmPassword = String(data.get('confirm_password') || '');

		if (!currentPassword || !newPassword || !confirmPassword) {
			return fail(400, { action: 'password', error: 'Complete all password fields.' });
		}
		if (newPassword.length < 6) {
			return fail(400, { action: 'password', error: 'New password must be at least 6 characters.' });
		}
		if (newPassword.length > 256) {
			return fail(400, { action: 'password', error: 'New password is too long.' });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { action: 'password', error: 'New passwords do not match.' });
		}
		if (newPassword === currentPassword) {
			return fail(400, { action: 'password', error: 'Choose a password different from your current password.' });
		}

		const account = await findAccountById(platform!.env.DB, locals.user.accountId);
		if (!account) return fail(404, { action: 'password', error: 'Account not found.' });

		try {
			const currentHash = await hashPassword(
				currentPassword,
				toBytes(account.password_salt),
				account.password_iters
			);
			if (!constantTimeEqual(currentHash, account.password_hash)) {
				return fail(401, { action: 'password', error: 'Current password is incorrect.' });
			}
		} catch {
			return fail(401, { action: 'password', error: 'Current password is incorrect.' });
		}

		const salt = newSalt();
		const passwordHash = await hashPassword(newPassword, salt, PASSWORD_ITERATIONS);
		await updateAccountPassword(
			platform!.env.DB,
			locals.user.accountId,
			passwordHash,
			salt,
			PASSWORD_ITERATIONS
		);

		const token = await signSession(
			{ accountId: account.id, email: account.email, role: account.role },
			platform!.env.JWT_SECRET
		);
		await registerSession(platform!.env.SESSIONS, account.id, token);
		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});

		return { action: 'password', success: 'Password changed successfully.' };
	}
};

function toBytes(value: unknown) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (value && typeof value === 'object') {
		const input = value as Record<string, unknown> & { byteLength?: number; length?: number };
		const length = input.byteLength ?? input.length ?? 16;
		const output = new Uint8Array(length);
		for (let i = 0; i < length; i++) {
			output[i] = input[String(i)] != null ? Number(input[String(i)]) : 0;
		}
		return output;
	}
	throw new Error('Cannot coerce password salt');
}
