// Background maintenance — invoked from the Worker's `scheduled` handler.
// Responsibilities:
//   1. Empty Trash older than TRASH_RETENTION_MS (default 30 days).
//   2. Reconcile per-account cached storage usage with reality.

import {
	listAccounts,
	deleteTrashOlderThan
} from '../db/queries.js';
import { reconcileStorageUsed } from '../db/storage.js';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const R2_DELETE_BATCH_SIZE = 1000;

export async function runMaintenance(env, ctx) {
	const start = Date.now();
	console.info('[cron] maintenance start');

	const result = {
		trashEmptied: 0,
		accountsReconciled: 0,
		storageWrites: 0,
		durationMs: 0
	};

	try {
		// --- 1. Trash auto-cleanup ----------------------------------------
		const trashKeys = await collectExpiredTrashKeys(env);
		if (trashKeys.length && env.MAIL) {
			for (let i = 0; i < trashKeys.length; i += R2_DELETE_BATCH_SIZE) {
				await env.MAIL.delete(trashKeys.slice(i, i + R2_DELETE_BATCH_SIZE));
			}
		}
		const removed = await deleteTrashOlderThan(env.DB, Date.now() - TRASH_RETENTION_MS);
		result.trashEmptied = removed;

		// --- 2. Storage usage reconciliation -------------------------------
		const accounts = await listAccounts(env.DB);
		for (const account of accounts) {
			try {
				const { updated } = await reconcileStorageUsed(env.DB, account.id);
				result.accountsReconciled += 1;
				if (updated) result.storageWrites += 1;
			} catch (err) {
				console.warn('[cron] reconcile failed for account', account.id, err);
			}
		}
	} catch (err) {
		console.error('[cron] maintenance failed', err);
	}

	result.durationMs = Date.now() - start;
	console.info('[cron] maintenance done', result);
	return result;
}

/**
 * Gather all R2 keys for trash messages that have aged past the retention window.
 * We read these before deletion so we can purge the blobs.
 */
async function collectExpiredTrashKeys(env) {
	const db = env.DB;
	const cutoff = Date.now() - TRASH_RETENTION_MS;
	const result = await db
		.prepare(
			`SELECT body_html_key AS storage_key FROM messages
			  WHERE folder = 'Trash' AND received_at < ? AND body_html_key IS NOT NULL
			 UNION ALL
			 SELECT body_text_key AS storage_key FROM messages
			  WHERE folder = 'Trash' AND received_at < ? AND body_text_key IS NOT NULL
			 UNION ALL
			 SELECT a.r2_key AS storage_key FROM attachments a
			 JOIN messages m ON m.id = a.message_id AND m.account_id = a.account_id
			  WHERE m.folder = 'Trash' AND m.received_at < ?`
		)
		.bind(cutoff, cutoff, cutoff)
		.all();
	return (result.results || []).map((row) => row.storage_key).filter(Boolean);
}