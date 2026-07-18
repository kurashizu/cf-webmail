import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getMessage, updateFlags } from '$lib/server/db/queries';

export const POST: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const msg = await getMessage(platform!.env.DB, locals.user.accountId, params.id);
	if (!msg) throw error(404, 'Not found');

	const flags = JSON.parse(msg.flags || '[]') as string[];
	const next = flags.includes('\\Seen') ? flags : [...flags, '\\Seen'];
	await updateFlags(platform!.env.DB, locals.user.accountId, params.id, next);

	return json({ ok: true, flags: next });
};

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const msg = await getMessage(platform!.env.DB, locals.user.accountId, params.id);
	if (!msg) throw error(404, 'Not found');
	const flags = (JSON.parse(msg.flags || '[]') as string[]).filter((f) => f !== '\\Seen');
	await updateFlags(platform!.env.DB, locals.user.accountId, params.id, flags);
	return json({ ok: true, flags });
};
