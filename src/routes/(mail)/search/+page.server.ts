import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { searchMessages } from '$lib/server/db/queries';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const query = String(url.searchParams.get('q') || '').trim().slice(0, 100);
	const folderParam = String(url.searchParams.get('folder') || 'all').toLowerCase();
	const folderMap: Record<string, string> = {
		inbox: 'INBOX', sent: 'Sent', drafts: 'Drafts', junk: 'Junk', trash: 'Trash'
	};
	const folder = folderMap[folderParam] || '';
	const statusParam = String(url.searchParams.get('status') || 'any').toLowerCase();
	const status = statusParam === 'read' || statusParam === 'unread' ? statusParam : 'any';
	const starred = url.searchParams.get('starred') === '1';
	const hasAttachments = url.searchParams.get('attachments') === '1';
	const from = normaliseDate(url.searchParams.get('from'));
	const to = normaliseDate(url.searchParams.get('to'));
	const hasFilters = !!folder || status !== 'any' || starred || hasAttachments || !!from || !!to;
	const messages = query || hasFilters
		? await searchMessages(
				platform!.env.DB,
				locals.user.accountId,
				query,
				{
					folder,
					status,
					starred,
					hasAttachments,
					includeTrash: folder === 'Trash',
					fromDate: from ? new Date(`${from}T00:00:00`).getTime() : null,
					toDate: to ? new Date(`${to}T23:59:59.999`).getTime() : null
				},
				100
			)
		: [];

	return {
		query,
		filters: { folder: folderParam, status, starred, hasAttachments, from, to },
		hasFilters,
		messages: messages.map(serialise)
	};
};

function normaliseDate(value: string | null) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
	return Number.isNaN(Date.parse(`${value}T00:00:00`)) ? '' : value;
}

function serialise(message: any) {
	return {
		id: message.id,
		folder: message.folder,
		direction: message.direction,
		fromAddr: message.from_addr,
		fromName: message.from_name,
		to: safeJson(message.to_addrs, []),
		subject: message.subject || '(no subject)',
		preview: message.preview || '',
		receivedAt: message.received_at,
		flags: safeJson(message.flags, []),
		hasAttachments: !!message.has_attachments
	};
}

function safeJson(value: string | null, fallback: any) {
	if (!value) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}
