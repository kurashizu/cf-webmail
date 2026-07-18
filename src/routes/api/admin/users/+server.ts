import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { deleteAccountData, findAccountById, listAccountStorageKeys, listAccounts } from '$lib/server/db/queries';

async function requireAdmin(locals: App.Locals) {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');
	return locals.user;
}

export const GET: RequestHandler = async ({ locals, platform }) => {
	await requireAdmin(locals);
	const accounts = await listAccounts(platform!.env.DB);
	const disabled = await Promise.all(
		accounts.map(async (account: any) => ({
			...account,
			disabled: (await platform!.env.SESSIONS.get(`disabled:${account.id}`)) === '1'
		}))
	);
	return json({ ok: true, users: disabled });
};

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const admin = await requireAdmin(locals);
	const body = (await request.json().catch(() => ({}))) as { id?: string; action?: string };
	if (!body.id || !['disable', 'enable'].includes(body.action || '')) throw error(400, 'Invalid user action');
	if (body.id === admin.accountId) throw error(400, 'You cannot disable your own account');
	const account = await findAccountById(platform!.env.DB, body.id);
	if (!account) throw error(404, 'User not found');

	if (body.action === 'disable') {
		await platform!.env.SESSIONS.put(`disabled:${body.id}`, '1');
		await platform!.env.SESSIONS.delete(`session:${body.id}`);
	} else {
		await platform!.env.SESSIONS.delete(`disabled:${body.id}`);
	}
	return json({ ok: true, disabled: body.action === 'disable' });
};

export const DELETE: RequestHandler = async ({ locals, platform, request }) => {
	const admin = await requireAdmin(locals);
	const body = (await request.json().catch(() => ({}))) as { id?: string };
	if (!body.id) throw error(400, 'Missing user id');
	if (body.id === admin.accountId) throw error(400, 'You cannot delete your own account');
	const account = await findAccountById(platform!.env.DB, body.id);
	if (!account) throw error(404, 'User not found');

	const keys = await listAccountStorageKeys(platform!.env.DB, body.id);
	if (platform!.env.MAIL && keys.length) {
		for (let offset = 0; offset < keys.length; offset += 1000) {
			await platform!.env.MAIL.delete(keys.slice(offset, offset + 1000));
		}
	}
	await deleteAccountData(platform!.env.DB, body.id);
	await platform!.env.SESSIONS.delete(`session:${body.id}`);
	await platform!.env.SESSIONS.delete(`disabled:${body.id}`);
	return json({ ok: true, deleted: body.id });
};
