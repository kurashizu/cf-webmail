import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getMessage, updateFlags } from '$lib/server/db/queries';

export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const msg = await getMessage(platform!.env.DB, locals.user.accountId, params.id);
	if (!msg) throw error(404, 'Not found');

	const kind = (url.searchParams.get('kind') || 'text').toLowerCase();
	const key = kind === 'html' ? msg.body_html_key : msg.body_text_key;
	if (!key) throw error(404, `${kind} body not available`);

	if (!platform!.env.MAIL) throw error(503, 'Attachment storage is unavailable');
	const obj = await platform!.env.MAIL.get(key);
	if (!obj) throw error(404, 'Body missing in storage');
	const body = await obj.text();
	return json({ ok: true, body });
};

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	// Set arbitrary flag (e.g. /read, /flagged) — used for future expansion.
	if (!locals.user) throw error(401, 'Unauthorized');
	const data = (await request.json().catch(() => ({}))) as { flag?: string; on?: boolean };
	if (!data.flag) throw error(400, 'Missing flag');
	const msg = await getMessage(platform!.env.DB, locals.user.accountId, params.id);
	if (!msg) throw error(404, 'Not found');

	const flags = JSON.parse(msg.flags || '[]') as string[];
	const next = data.on === false
		? flags.filter((f) => f !== data.flag)
		: flags.includes(data.flag!) ? flags : [...flags, data.flag!];
	await updateFlags(platform!.env.DB, locals.user.accountId, params.id, next);
	return json({ ok: true, flags: next });
};
