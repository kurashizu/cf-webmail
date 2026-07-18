import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { emptyTrash, listTrashStorageKeys } from '$lib/server/db/queries';
import { resetStorageUsed, reconcileStorageUsed } from '$lib/server/db/storage';

const R2_DELETE_BATCH_SIZE = 1000;

export const DELETE: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const env = platform!.env;
	const accountId = locals.user.accountId;

	const storageKeys = await listTrashStorageKeys(env.DB, accountId);
	if (env.MAIL && storageKeys.length) {
		for (let index = 0; index < storageKeys.length; index += R2_DELETE_BATCH_SIZE) {
			await env.MAIL.delete(storageKeys.slice(index, index + R2_DELETE_BATCH_SIZE));
		}
	}

	const deleted = await emptyTrash(env.DB, accountId);
	// After emptying, reconcile cached usage with reality so the counter
	// reflects the cleared messages + attachments.
	await reconcileStorageUsed(env.DB, accountId);
	return json({ ok: true, deleted });
};
