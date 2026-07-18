import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

const ALLOWED_FOLDERS = new Set(['INBOX', 'Sent', 'Drafts', 'Trash', 'Junk']);
const ALLOWED_ACTIONS = new Set(['read', 'unread', 'star', 'unstar', 'move']);

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const body = (await request.json().catch(() => ({}))) as {
		ids?: string[];
		action?: string;
		folder?: string;
	};
	const ids = [...new Set((body.ids || []).filter((id): id is string => typeof id === 'string' && id.length > 0))];
	if (!ids.length) throw error(400, 'Select at least one message.');
	if (ids.length > 100) throw error(400, 'You can update up to 100 messages at once.');
	if (!body.action || !ALLOWED_ACTIONS.has(body.action)) throw error(400, 'Invalid bulk action.');
	if (body.action === 'move' && (!body.folder || !ALLOWED_FOLDERS.has(body.folder))) throw error(400, 'Invalid destination folder.');

	const db = platform!.env.DB;
	const placeholders = ids.map(() => '?').join(',');
	const found = await db.prepare(`SELECT id, flags FROM messages WHERE account_id = ? AND id IN (${placeholders})`)
		.bind(locals.user.accountId, ...ids)
		.all<{ id: string; flags: string }>();
	if ((found.results || []).length !== ids.length) throw error(404, 'One or more messages were not found.');

	if (body.action === 'move') {
		await db.batch(ids.map((id) => db.prepare('UPDATE messages SET folder = ? WHERE account_id = ? AND id = ?').bind(body.folder, locals.user!.accountId, id)));
	} else {
		const flag = body.action === 'read' || body.action === 'unread' ? '\\Seen' : '\\Flagged';
		const enabled = body.action === 'read' || body.action === 'star';
		await db.batch((found.results || []).map((message) => {
			const flags = JSON.parse(message.flags || '[]') as string[];
			const next = enabled ? (flags.includes(flag) ? flags : [...flags, flag]) : flags.filter((item) => item !== flag);
			return db.prepare('UPDATE messages SET flags = ? WHERE account_id = ? AND id = ?')
				.bind(JSON.stringify(next), locals.user!.accountId, message.id);
		}));
	}

	return json({ ok: true, updated: ids.length, action: body.action, folder: body.folder || null });
};
