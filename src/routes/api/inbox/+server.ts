import type { RequestHandler } from './$types';
import { listMessages } from '$lib/server/db/queries';

function safeJson(s: string | null, fallback: any) {
	if (!s) return fallback;
	try { return JSON.parse(s); } catch { return fallback; }
}

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}
	const messages = await listMessages(platform!.env.DB, locals.user.accountId, 'INBOX', {
		limit: 100
	});
	const serialised = messages.map((m: any) => ({
		id: m.id,
		fromAddr: m.from_addr,
		fromName: m.from_name,
		to: safeJson(m.to_addrs, []),
		subject: m.subject || '(no subject)',
		preview: m.preview || '',
		receivedAt: m.received_at,
		flags: safeJson(m.flags, []),
		hasAttachments: !!m.has_attachments,
		direction: m.direction
	}));
	return new Response(JSON.stringify({ messages: serialised }), {
		headers: { 'content-type': 'application/json' }
	});
};
