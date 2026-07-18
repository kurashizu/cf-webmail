import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getAttachment } from '$lib/server/db/queries';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const attachment = await getAttachment(
		platform!.env.DB,
		locals.user.accountId,
		params.id,
		params.aid
	);
	if (!attachment) throw error(404, 'Attachment not found');

	const mail = platform!.env.MAIL;
	if (!mail) throw error(503, 'Attachment storage is unavailable');
	const object = await mail.get(attachment.r2_key);
	if (!object) throw error(404, 'Attachment data is missing');

	const filename = safeFilename(attachment.filename || 'attachment');
	const headers = new Headers({
		'Content-Type': attachment.mime_type || 'application/octet-stream',
		'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
		'Content-Length': String(object.size),
		'Cache-Control': 'private, no-store',
		'X-Content-Type-Options': 'nosniff'
	});

	return new Response(object.body as unknown as BodyInit, { headers });
};

function safeFilename(value: string) {
	return value.replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'attachment';
}
