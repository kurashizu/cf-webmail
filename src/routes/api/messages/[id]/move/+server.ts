import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getMessage, moveMessage } from '$lib/server/db/queries';

const ALLOWED = new Set(['INBOX', 'Sent', 'Drafts', 'Trash', 'Junk', 'Starred']);

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const body = (await request.json().catch(() => ({}))) as { folder?: string };
	if (!body.folder || !ALLOWED.has(body.folder)) {
		throw error(400, 'Invalid folder');
	}
	const msg = await getMessage(platform!.env.DB, locals.user.accountId, params.id);
	if (!msg) throw error(404, 'Not found');
	await moveMessage(platform!.env.DB, locals.user.accountId, params.id, body.folder);
	return json({ ok: true });
};
