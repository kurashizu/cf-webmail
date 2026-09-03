import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getAttachment, getAccountStorageBackend } from '$lib/server/db/queries';
import { getStorage } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const env = platform!.env;
	const attachment = await getAttachment(
		env.DB,
		locals.user.accountId,
		params.id,
		params.aid
	);
	if (!attachment) throw error(404, 'Attachment not found');

	const backend = await getAccountStorageBackend(env.DB, locals.user.accountId);
	const storage = getStorage(backend, env);
	if (!storage) throw error(503, 'Attachment storage is unavailable');
	const object = await storage.get(attachment.r2_key);
	if (!object) throw error(404, 'Attachment data is missing');

	const filename = safeFilename(attachment.filename || 'attachment');
	const headers = new Headers({
		'Content-Type': attachment.mime_type || 'application/octet-stream',
		'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
		'Cache-Control': 'private, no-store',
		'X-Content-Type-Options': 'nosniff'
	});
	// Prefer the DB-recorded size (always a real number, set at insert time)
	// over the storage object's own size — the S3 adapter's size can be
	// undefined if the backend's response omits Content-Length.
	const knownSize = Number(attachment.size ?? object.size);
	if (Number.isFinite(knownSize)) headers.set('Content-Length', String(knownSize));

	return new Response(object.body as unknown as BodyInit, { headers });
};

function safeFilename(value: string) {
	return value.replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'attachment';
}
