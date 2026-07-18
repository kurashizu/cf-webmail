import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { sendOutbound } from '$lib/server/mail/outbound';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const data = (await request.json()) as {
		to?: string;
		cc?: string;
		bcc?: string;
		subject?: string;
		text?: string;
		html?: string;
		inReplyTo?: string;
	};
	if (!data.to || !data.subject || (!data.text && !data.html)) {
		throw error(400, 'Missing required fields');
	}
	const result = await sendOutbound(
		{
			accountId: locals.user.accountId,
			to: data.to,
			cc: data.cc,
			bcc: data.bcc,
			subject: data.subject,
			text: data.text || '',
			html: data.html || data.text || '',
			replyToMessageId: data.inReplyTo
		},
		platform!.env
	);
	if (!result.ok) {
		throw error(result.status || 500, result.error || 'Send failed');
	}
	return json({ ok: true, messageId: result.messageId });
};
