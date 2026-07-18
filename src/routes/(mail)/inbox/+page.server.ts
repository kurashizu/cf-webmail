import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listMessages } from '$lib/server/db/queries';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) throw redirect(303, '/login');
	const messages = await listMessages(platform!.env.DB, locals.user.accountId, 'INBOX', {
		limit: 100
	});
	return {
		folder: 'INBOX',
		folderSlug: 'inbox',
		messages: messages.map(serialise),
		userEmail: locals.user.email
	};
};

function serialise(m: any) {
	return {
		id: m.id,
		fromAddr: m.from_addr,
		to: safeJson(m.to_addrs, []),
		subject: m.subject || '(no subject)',
		preview: m.preview || '',
		receivedAt: m.received_at,
		flags: safeJson(m.flags, []),
		hasAttachments: !!m.has_attachments,
		direction: m.direction
	};
}

function safeJson(s: string | null, fallback: any) {
	if (!s) return fallback;
	try {
		return JSON.parse(s);
	} catch {
		return fallback;
	}
}
