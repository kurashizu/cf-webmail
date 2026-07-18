// Storage quota helpers — plain JS because the vite plugin bundles this directly.
// Single source of truth for per-account storage usage (messages.size + attachments.size)
// and the soft quota guard.

export const DEFAULT_QUOTA_BYTES = 200 * 1024 * 1024; // 200 MiB
export const DEFAULT_QUOTA_MESSAGES = 1000;
export const MAX_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB hard ceiling per user
export const MIN_QUOTA_BYTES = 100 * 1024 * 1024;       // 100 MiB minimum (unless 0 = unlimited)
export const MAX_QUOTA_MESSAGES = 50000;

export class StorageQuotaError extends Error {
	constructor(used, quota, incoming, kind = 'storage') {
		super(`Mailbox ${kind} quota exceeded: ${used}/${quota}, incoming ${incoming}`);
		this.code = 'STORAGE_QUOTA_EXCEEDED';
		this.kind = kind; // 'storage' | 'messages'
		this.used = used;
		this.quota = quota;
		this.incoming = incoming;
	}
}

/**
 * Recompute the user's real storage usage from authoritative tables.
 * Two indexed SUMs; cheap even at thousands of rows.
 */
export async function recomputeStorageUsed(db, accountId) {
	const row = await db
		.prepare(
			`SELECT
			   COALESCE((SELECT SUM(size) FROM messages    WHERE account_id = ?), 0) +
			   COALESCE((SELECT SUM(size) FROM attachments WHERE account_id = ?), 0)
			   AS used`
		)
		.bind(accountId, accountId)
		.first();
	return Number(row?.used || 0);
}

/**
 * Count of messages currently in any folder for an account.
 */
export async function countMessages(db, accountId) {
	const row = await db
		.prepare('SELECT COUNT(*) AS c FROM messages WHERE account_id = ?')
		.bind(accountId)
		.first();
	return Number(row?.c || 0);
}

/**
 * Increment cached usage after a successful insert. Idempotent: pass 0 to no-op.
 */
export async function addStorageUsed(db, accountId, bytes) {
	if (!bytes) return;
	await db
		.prepare(
			'UPDATE accounts SET storage_used_bytes = storage_used_bytes + ?, updated_at = ? WHERE id = ?'
		)
		.bind(bytes, Date.now(), accountId)
		.run();
}

/**
 * Decrement cached usage after a successful delete. Floors at 0.
 */
export async function subtractStorageUsed(db, accountId, bytes) {
	if (!bytes) return;
	await db
		.prepare(
			`UPDATE accounts
			    SET storage_used_bytes = MAX(0, storage_used_bytes - ?),
			        updated_at = ?
			  WHERE id = ?`
		)
		.bind(bytes, Date.now(), accountId)
		.run();
}

/**
 * Reset cached usage (e.g. before deleting all messages of a user).
 */
export async function resetStorageUsed(db, accountId) {
	await db
		.prepare('UPDATE accounts SET storage_used_bytes = 0, updated_at = ? WHERE id = ?')
		.bind(Date.now(), accountId)
		.run();
}

/**
 * Ensure cached value matches reality. Only writes back if drift > driftThreshold bytes.
 * Returns the recomputed value (always) and a boolean indicating whether the DB row was updated.
 */
export async function reconcileStorageUsed(db, accountId, driftThreshold = 1024 * 1024) {
	const row = await db
		.prepare('SELECT storage_used_bytes FROM accounts WHERE id = ?')
		.bind(accountId)
		.first();
	const cached = Number(row?.storage_used_bytes || 0);
	const real = await recomputeStorageUsed(db, accountId);
	if (Math.abs(real - cached) > driftThreshold) {
		await db
			.prepare('UPDATE accounts SET storage_used_bytes = ?, updated_at = ? WHERE id = ?')
			.bind(real, Date.now(), accountId)
			.run();
		return { used: real, updated: true };
	}
	return { used: real, updated: false };
}

/**
 * Quota guard. Throws StorageQuotaError if the proposed write would push the user over.
 * `incomingBytes` may be 0 if only checking message count.
 */
export async function assertQuota(db, accountId, incomingBytes = 0, incomingMessageCount = 1) {
	const row = await db
		.prepare('SELECT quota_bytes, quota_messages, storage_used_bytes FROM accounts WHERE id = ?')
		.bind(accountId)
		.first();
	if (!row) return; // no account → caller decides what to do

	const quotaBytes = Number(row.quota_bytes ?? DEFAULT_QUOTA_BYTES);
	const quotaMessages = Number(row.quota_messages ?? DEFAULT_QUOTA_MESSAGES);

	// 0 quota means unlimited (admin opt-in).
	if (quotaBytes === 0 && quotaMessages === 0) return;

	const used = Number(row.storage_used_bytes || 0);
	if (quotaBytes > 0 && incomingBytes > 0 && used + incomingBytes > quotaBytes) {
		throw new StorageQuotaError(used, quotaBytes, incomingBytes, 'storage');
	}

	if (quotaMessages > 0 && incomingMessageCount > 0) {
		const count = await countMessages(db, accountId);
		if (count + incomingMessageCount > quotaMessages) {
			throw new StorageQuotaError(count, quotaMessages, incomingMessageCount, 'messages');
		}
	}
}

/**
 * Convenience: read account quota + cached usage as a snapshot for the UI.
 */
export async function getStorageSnapshot(db, accountId) {
	const row = await db
		.prepare(
			`SELECT a.quota_bytes, a.quota_messages, a.storage_used_bytes,
			        (SELECT COUNT(*) FROM messages WHERE account_id = a.id) AS message_count
			   FROM accounts a
			  WHERE a.id = ?`
		)
		.bind(accountId)
		.first();
	if (!row) return null;
	const quotaBytes = Number(row.quota_bytes ?? DEFAULT_QUOTA_BYTES);
	const used = Number(row.storage_used_bytes || 0);
	return {
		used_bytes: used,
		quota_bytes: quotaBytes,
		message_count: Number(row.message_count || 0),
		quota_messages: Number(row.quota_messages ?? DEFAULT_QUOTA_MESSAGES)
	};
}

/**
 * Sum size for a list of message ids (used by bulk-delete paths to decrement the cache).
 */
export async function sumMessageSizes(db, accountId, messageIds) {
	if (!messageIds || !messageIds.length) return 0;
	const placeholders = messageIds.map(() => '?').join(',');
	const row = await db
		.prepare(
			`SELECT COALESCE(SUM(size), 0) AS s
			   FROM messages
			  WHERE account_id = ? AND id IN (${placeholders})`
		)
		.bind(accountId, ...messageIds)
		.first();
	return Number(row?.s || 0);
}

/**
 * Sum attachment sizes for a list of message ids (used by bulk-delete paths).
 */
export async function sumAttachmentSizesForMessages(db, accountId, messageIds) {
	if (!messageIds || !messageIds.length) return 0;
	const placeholders = messageIds.map(() => '?').join(',');
	const row = await db
		.prepare(
			`SELECT COALESCE(SUM(size), 0) AS s
			   FROM attachments
			  WHERE account_id = ? AND message_id IN (${placeholders})`
		)
		.bind(accountId, ...messageIds)
		.first();
	return Number(row?.s || 0);
}