import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { listMessages, countMessagesInFolder } from '$lib/server/db/queries';

const SLUG_MAP: Record<string, string> = {
	inbox: 'INBOX',
	sent: 'Sent',
	drafts: 'Drafts',
	trash: 'Trash',
	starred: 'Starred'
};

export const load: PageServerLoad = async ({ params, locals, platform, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const folder = SLUG_MAP[params.folder.toLowerCase()];
	if (!folder) throw error(404, 'Unknown folder');

	const pageSize = Math.max(1, Number(platform?.env.DEFAULT_PAGE_SIZE || 10) || 10);
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const total = await countMessagesInFolder(platform!.env.DB, locals.user.accountId, folder);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const messages = await listMessages(platform!.env.DB, locals.user.accountId, folder, {
		limit: pageSize,
		offset: (page - 1) * pageSize
	});

	return {
		folder,
		folderSlug: params.folder.toLowerCase(),
		messages: messages.map(serialise),
		pagination: { page, pageSize, total, totalPages }
	};
};

function serialise(m: any) {
	return {
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
	};
}

function safeJson(s: string | null, fallback: any) {
	if (!s) return fallback;
	try {
		return JSON.parse(s);
	} catch {
		return [];
	}
}
