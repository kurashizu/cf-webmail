import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listMessages, countMessagesInFolder } from '$lib/server/db/queries';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) throw redirect(303, '/login');

	const pageSize = Math.max(1, Number(platform?.env.DEFAULT_PAGE_SIZE || 20) || 20);
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const total = await countMessagesInFolder(platform!.env.DB, locals.user.accountId, 'INBOX');
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const messages = await listMessages(platform!.env.DB, locals.user.accountId, 'INBOX', {
		limit: pageSize,
		offset: (page - 1) * pageSize
	});

	return {
		folder: 'INBOX',
		folderSlug: 'inbox',
		messages: messages.map(serialise),
		userEmail: locals.user.email,
		pagination: { page, pageSize, total, totalPages }
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
