import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getStorageSnapshot, reconcileStorageUsed, DEFAULT_QUOTA_BYTES, DEFAULT_QUOTA_MESSAGES } from '$lib/server/db/storage';

/**
 * GET /api/storage
 * Returns the current user's storage usage + quota snapshot.
 * Always reconciles cached usage with reality first so the UI shows the
 * truth even after drift from deleted-from-R2-only paths.
 */
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform!.env.DB;
	await reconcileStorageUsed(db, locals.user.accountId);
	const snapshot = await getStorageSnapshot(db, locals.user.accountId);
	if (!snapshot) throw error(404, 'Account not found');
	return json({
		...snapshot,
		defaults: {
			quota_bytes: DEFAULT_QUOTA_BYTES,
			quota_messages: DEFAULT_QUOTA_MESSAGES
		}
	});
};
