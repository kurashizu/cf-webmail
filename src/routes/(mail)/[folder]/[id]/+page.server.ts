import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getMessage, listAttachments } from '$lib/server/db/queries';

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

	const msg = await getMessage(platform!.env.DB, locals.user.accountId, params.id);
	if (!msg) throw error(404, 'Message not found');

	const attachments = await listAttachments(platform!.env.DB, locals.user.accountId, params.id);

	return {
		folder,
		folderSlug: params.folder.toLowerCase(),
		message: {
			id: msg.id,
			direction: msg.direction,
			subject: msg.subject || '(no subject)',
			fromAddr: msg.from_addr,
			fromName: msg.from_name,
			to: safeJson(msg.to_addrs, []),
			cc: safeJson(msg.cc_addrs, []),
			receivedAt: msg.received_at,
			flags: safeJson(msg.flags, []),
			hasHtml: !!msg.body_html_key,
			hasText: !!msg.body_text_key,
			size: msg.size,
			messageId: msg.message_id,
			inReplyTo: msg.in_reply_to
		},
		attachments: attachments.map((a) => ({
			id: a.id,
			filename: a.filename,
			mimeType: a.mime_type,
			size: a.size
		}))
	};
};

function safeJson(s: string | null, fallback: any) {
	if (!s) return fallback;
	try {
		return JSON.parse(s);
	} catch {
		return fallback;
	}
}
