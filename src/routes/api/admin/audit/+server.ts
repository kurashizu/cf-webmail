import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { countAuditLog, listAuditEventTypes, listAuditLog } from '$lib/server/db/queries';

function requireAdmin(locals: App.Locals) {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');
	return locals.user;
}

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	requireAdmin(locals);
	const env = platform!.env;

	const event = url.searchParams.get('event') || undefined;
	const accountId = url.searchParams.get('account_id') || undefined;
	const limit = Number(url.searchParams.get('limit')) || 50;
	const offset = Number(url.searchParams.get('offset')) || 0;

	const [entries, total, eventTypes] = await Promise.all([
		listAuditLog(env.DB, { event, accountId, limit, offset }),
		countAuditLog(env.DB, { event, accountId }),
		listAuditEventTypes(env.DB)
	]);

	return json({
		ok: true,
		entries: entries.map((row: any) => ({
			...row,
			detail: row.detail ? JSON.parse(row.detail) : null
		})),
		total,
		eventTypes,
		limit,
		offset
	});
};
