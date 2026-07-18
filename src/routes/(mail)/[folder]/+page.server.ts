import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { listMessages } from '$lib/server/db/queries';

const SLUG_MAP: Record<string, string> = {
	inbox: 'INBOX',
	sent: 'Sent',
	drafts: 'Drafts',
	trash: 'Trash',
	junk: 'Junk',
	starred: 'Starred'
};

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	if (!locals.user) throw redirect(303, '/login');
	const folder = SLUG_MAP[params.folder.toLowerCase()];
	if (!folder) throw error(404, 'Unknown folder');

	const messages = await listMessages(platform!.env.DB, locals.user.accountId, folder, {
		limit: 100
	});

	return {
		folder,
		folderSlug: params.folder.toLowerCase(),
		messages: messages.map(serialise)
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
