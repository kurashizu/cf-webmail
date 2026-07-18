// D1 query helpers — plain JS because the vite plugin bundles this directly.
// Schema is in migrations/0001_init.sql.

/**
 * Generate a uuid v4.
 */
export function uuid() {
	return crypto.randomUUID();
}

// --- accounts -------------------------------------------------------------

/**
 * Find an account by full email.
 * @param {D1Database} db
 * @param {string} email
 */
export async function findAccountByEmail(db, email) {
	return db
		.prepare('SELECT * FROM accounts WHERE email = ?')
		.bind(email.toLowerCase())
		.first();
}

/**
 * Find an account by local part.
 */
export async function findAccountByLocalPart(db, localPart) {
	return db
		.prepare('SELECT * FROM accounts WHERE local_part = ?')
		.bind(localPart.toLowerCase())
		.first();
}

/**
 * Find an account by id.
 */
export async function findAccountById(db, id) {
	return db
		.prepare('SELECT * FROM accounts WHERE id = ?')
		.bind(id)
		.first();
}

/**
 * Create a new account.
 */
export async function createAccount(db, account) {
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO accounts (
				id, local_part, email, display_name,
				password_hash, password_salt, password_iters,
				role, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			account.id,
			account.localPart.toLowerCase(),
			account.email.toLowerCase(),
			account.displayName ?? null,
			account.passwordHash,
			account.passwordSalt,
			account.passwordIters ?? 600_000,
			account.role ?? 'user',
			now,
			now
		)
		.run();
}

export async function updateAccountProfile(db, accountId, displayName) {
	await db
		.prepare('UPDATE accounts SET display_name = ?, updated_at = ? WHERE id = ?')
		.bind(displayName || null, Date.now(), accountId)
		.run();
}

export async function updateAccountPassword(db, accountId, passwordHash, passwordSalt, passwordIters = 100_000) {
	await db
		.prepare(
			'UPDATE accounts SET password_hash = ?, password_salt = ?, password_iters = ?, updated_at = ? WHERE id = ?'
		)
		.bind(passwordHash, passwordSalt, passwordIters, Date.now(), accountId)
		.run();
}

export async function listAccounts(db) {
	const result = await db
		.prepare(
			`SELECT a.id, a.local_part, a.email, a.display_name, a.role,
			        a.created_at, a.updated_at,
			        a.quota_bytes, a.quota_messages, a.storage_used_bytes,
			        COUNT(DISTINCT m.id) AS message_count,
			        COALESCE(SUM(CASE WHEN m.folder = 'INBOX' AND m.flags NOT LIKE '%\\Seen%' THEN 1 ELSE 0 END), 0) AS unread_count,
			        MAX(m.received_at) AS last_message_at,
			        COUNT(DISTINCT CASE WHEN m.has_attachments = 1 THEN m.id END) AS messages_with_attachments
			   FROM accounts a
			   LEFT JOIN messages m ON m.account_id = a.id
			  GROUP BY a.id
			  ORDER BY a.created_at ASC`
		)
		.all();
	return result.results || [];
}

export async function updateAccountByAdmin(db, accountId, displayName, role) {
	await db
		.prepare('UPDATE accounts SET display_name = ?, role = ?, updated_at = ? WHERE id = ?')
		.bind(displayName || null, role, Date.now(), accountId)
		.run();
}

export async function listAccountStorageKeys(db, accountId) {
	const result = await db
		.prepare(
			`SELECT body_html_key AS storage_key FROM messages WHERE account_id = ? AND body_html_key IS NOT NULL
			 UNION ALL SELECT body_text_key FROM messages WHERE account_id = ? AND body_text_key IS NOT NULL
			 UNION ALL SELECT r2_key FROM attachments WHERE account_id = ?`
		)
		.bind(accountId, accountId, accountId)
		.all();
	return (result.results || []).map((row) => row.storage_key).filter(Boolean);
}

export async function deleteAccountData(db, accountId) {
	await db.batch([
		db.prepare('DELETE FROM attachments WHERE account_id = ?').bind(accountId),
		db.prepare('DELETE FROM messages WHERE account_id = ?').bind(accountId),
		db.prepare('DELETE FROM folders WHERE account_id = ?').bind(accountId),
		db.prepare('UPDATE invite_codes SET consumed_by = NULL WHERE consumed_by = ?').bind(accountId),
		db.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId)
	]);
	// accounts row is gone; storage counter goes with it. Cron reconciliation
	// (which sums by account_id) will simply skip this account.
}

// --- folders --------------------------------------------------------------

const DEFAULT_FOLDERS = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Junk', 'Starred'];

/**
 * Ensure the default folder rows exist for an account.
 */
export async function ensureFolders(db, accountId) {
	const now = Date.now();
	const stmt = db.prepare(
		`INSERT OR IGNORE INTO folders (account_id, name, unread_count, total_count, last_message_at)
		 VALUES (?, ?, 0, 0, NULL)`
	);
	for (const name of DEFAULT_FOLDERS) {
		await stmt.bind(accountId, name).run();
	}
}

/**
 * Get all folders for an account, in a stable order.
 */
export async function listFolders(db, accountId) {
	const result = await db
		.prepare(
			`SELECT f.name,
			        CASE
			          WHEN f.name = 'Starred' THEN 0
			          ELSE (SELECT COUNT(*) FROM messages m
			                WHERE m.account_id = f.account_id
			                  AND m.folder = f.name
			                  AND m.flags NOT LIKE '%\\Seen%')
			        END AS unread_count,
			        f.total_count,
			        f.last_message_at,
			        CASE
			          WHEN f.name = 'Starred' THEN (SELECT COUNT(*) FROM messages m
			                WHERE m.account_id = f.account_id
			                  AND m.folder != 'Trash'
			                  AND m.flags LIKE '%\\Flagged%')
			          ELSE (SELECT COUNT(*) FROM messages m
			                WHERE m.account_id = f.account_id AND m.folder = f.name)
			        END AS computed_total
			   FROM folders f
			  WHERE f.account_id = ?
			  ORDER BY CASE f.name
			            WHEN 'INBOX' THEN 0
			            WHEN 'Starred' THEN 1
			            WHEN 'Sent' THEN 2
			            WHEN 'Drafts' THEN 3
			            WHEN 'Junk' THEN 4
			            WHEN 'Trash' THEN 5
			            ELSE 6 END`
		)
		.bind(accountId)
		.all();
	return result.results || [];
}

/**
 * Increment unread counter on a folder after a new inbound message arrives.
 */
export async function bumpFolderOnReceive(db, accountId, folder, ts) {
	await db
		.prepare(
			`UPDATE folders
			    SET total_count = total_count + 1,
			        unread_count = unread_count + 1,
			        last_message_at = COALESCE(?, last_message_at)
			  WHERE account_id = ? AND name = ?`
		)
		.bind(ts, accountId, folder)
		.run();
}

// --- messages -------------------------------------------------------------

/**
 * List messages in a folder, newest first.
 */
export async function listMessages(db, accountId, folder, opts = {}) {
	const limit = opts.limit ?? 50;
	const before = opts.before; // received_at cursor

	let query;
	let bind;
	const starred = folder === 'Starred';
	const folderFilter = starred
		? `folder != 'Trash' AND flags LIKE '%\\Flagged%'`
		: 'folder = ?';
	if (before) {
		query = `SELECT * FROM messages
		          WHERE account_id = ? AND ${folderFilter} AND received_at < ?
		          ORDER BY received_at DESC
		          LIMIT ?`;
		bind = starred ? [accountId, before, limit] : [accountId, folder, before, limit];
	} else {
		query = `SELECT * FROM messages
		          WHERE account_id = ? AND ${folderFilter}
		          ORDER BY received_at DESC
		          LIMIT ?`;
		bind = starred ? [accountId, limit] : [accountId, folder, limit];
	}
	const result = await db.prepare(query).bind(...bind).all();
	return result.results || [];
}

export async function searchMessages(db, accountId, term, filters = {}, limit = 100) {
	const conditions = ['account_id = ?'];
	const values = [accountId];

	if (!filters.includeTrash) conditions.push(`folder != 'Trash'`);
	if (term) {
		const escaped = String(term).replace(/[\\%_]/g, (character) => `\\${character}`);
		const pattern = `%${escaped}%`;
		conditions.push(`(
			subject LIKE ? ESCAPE '\\' COLLATE NOCASE
			OR from_addr LIKE ? ESCAPE '\\' COLLATE NOCASE
			OR from_name LIKE ? ESCAPE '\\' COLLATE NOCASE
			OR to_addrs LIKE ? ESCAPE '\\' COLLATE NOCASE
			OR cc_addrs LIKE ? ESCAPE '\\' COLLATE NOCASE
			OR preview LIKE ? ESCAPE '\\' COLLATE NOCASE
		)`);
		values.push(pattern, pattern, pattern, pattern, pattern, pattern);
	}
	if (filters.folder) {
		conditions.push('folder = ?');
		values.push(filters.folder);
	}
	if (filters.status === 'read') conditions.push(`flags LIKE '%\\Seen%'`);
	if (filters.status === 'unread') conditions.push(`flags NOT LIKE '%\\Seen%'`);
	if (filters.starred) conditions.push(`flags LIKE '%\\Flagged%'`);
	if (filters.hasAttachments) conditions.push('has_attachments = 1');
	if (filters.fromDate) {
		conditions.push('received_at >= ?');
		values.push(filters.fromDate);
	}
	if (filters.toDate) {
		conditions.push('received_at <= ?');
		values.push(filters.toDate);
	}

	const result = await db
		.prepare(
			`SELECT * FROM messages
			  WHERE ${conditions.join(' AND ')}
			  ORDER BY received_at DESC
			  LIMIT ?`
		)
		.bind(...values, limit)
		.all();
	return result.results || [];
}

/**
 * Get a single message by id.
 */
export async function getMessage(db, accountId, id) {
	return db
		.prepare('SELECT * FROM messages WHERE account_id = ? AND id = ?')
		.bind(accountId, id)
		.first();
}

/**
 * Get a single message by its RFC 5322 Message-ID header (e.g. for threading).
 */
export async function getMessageByMessageId(db, accountId, messageId) {
	return db
		.prepare('SELECT * FROM messages WHERE account_id = ? AND message_id = ?')
		.bind(accountId, messageId)
		.first();
}

/**
 * Insert (or ignore) a message. Returns true if a row was inserted.
 */
export async function insertMessage(db, msg) {
	const now = Date.now();
	const result = await db
		.prepare(
			`INSERT OR IGNORE INTO messages (
				id, account_id, folder, direction,
				message_id, in_reply_to, thread_id,
				from_addr, from_name, to_addrs, cc_addrs, bcc_addrs,
				subject, preview, body_html_key, body_text_key,
				has_attachments, flags, size,
				received_at, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			msg.id ?? uuid(),
			msg.accountId,
			msg.folder,
			msg.direction,
			msg.messageId ?? null,
			msg.inReplyTo ?? null,
			msg.threadId ?? null,
			msg.fromAddr ?? null,
			msg.fromName ?? null,
			JSON.stringify(msg.toAddrs ?? []),
			JSON.stringify(msg.ccAddrs ?? []),
			msg.direction === 'outbound' ? JSON.stringify(msg.bccAddrs ?? []) : null,
			msg.subject ?? '',
			msg.preview ?? '',
			msg.bodyHtmlKey ?? null,
			msg.bodyTextKey ?? null,
			msg.hasAttachments ? 1 : 0,
			JSON.stringify(msg.flags ?? []),
			msg.size ?? 0,
			msg.receivedAt ?? now,
			now
		)
		.run();
	return result.meta?.changes > 0;
}

/**
 * Replace the flags array for a message.
 */
export async function updateFlags(db, accountId, id, flags) {
	await db
		.prepare('UPDATE messages SET flags = ? WHERE account_id = ? AND id = ?')
		.bind(JSON.stringify(flags), accountId, id)
		.run();
}

/**
 * Move a message to a different folder (e.g. archive, trash, starred).
 */
export async function moveMessage(db, accountId, id, folder) {
	await db
		.prepare('UPDATE messages SET folder = ? WHERE account_id = ? AND id = ?')
		.bind(folder, accountId, id)
		.run();
}

/**
 * Delete a message entirely.
 */
export async function deleteMessage(db, accountId, id) {
	await db
		.prepare('DELETE FROM messages WHERE account_id = ? AND id = ?')
		.bind(accountId, id)
		.run();
}

/**
 * Mark all messages in a folder as read.
 */
export async function markAllRead(db, accountId, folder) {
	const newFlags = JSON.stringify(['\\Seen']);
	await db
		.prepare(
			`UPDATE messages
			    SET flags = ?
			  WHERE account_id = ? AND folder = ?
			    AND flags NOT LIKE '%\\Seen%'`
		)
		.bind(newFlags, accountId, folder)
		.run();
	await db
		.prepare('UPDATE folders SET unread_count = 0 WHERE account_id = ? AND name = ?')
		.bind(accountId, folder)
		.run();
}

export async function listTrashStorageKeys(db, accountId) {
	const result = await db
		.prepare(
			`SELECT body_html_key AS storage_key FROM messages
			  WHERE account_id = ? AND folder = 'Trash' AND body_html_key IS NOT NULL
			 UNION ALL
			 SELECT body_text_key AS storage_key FROM messages
			  WHERE account_id = ? AND folder = 'Trash' AND body_text_key IS NOT NULL
			 UNION ALL
			 SELECT a.r2_key AS storage_key FROM attachments a
			 JOIN messages m ON m.id = a.message_id AND m.account_id = a.account_id
			  WHERE m.account_id = ? AND m.folder = 'Trash'`
		)
		.bind(accountId, accountId, accountId)
		.all();
	return (result.results || []).map((row) => row.storage_key).filter(Boolean);
}

export async function emptyTrash(db, accountId) {
	const messages = await db
		.prepare(`SELECT id FROM messages WHERE account_id = ? AND folder = 'Trash'`)
		.bind(accountId)
		.all();
	const ids = (messages.results || []).map((message) => message.id);
	if (!ids.length) return 0;

	await db.batch([
		db.prepare(
			`DELETE FROM attachments
			  WHERE account_id = ?
			    AND message_id IN (SELECT id FROM messages WHERE account_id = ? AND folder = 'Trash')`
		).bind(accountId, accountId),
		db.prepare(`DELETE FROM messages WHERE account_id = ? AND folder = 'Trash'`).bind(accountId),
		db.prepare(
			`UPDATE folders SET unread_count = 0, total_count = 0, last_message_at = NULL
			  WHERE account_id = ? AND name = 'Trash'`
		).bind(accountId)
	]);
	return ids.length;
}

/**
 * Delete trash messages older than `cutoff` for every account. Used by the
 * cron maintenance job. Returns the total number of messages purged.
 */
export async function deleteTrashOlderThan(db, cutoff) {
	const before = await db
		.prepare(
			`SELECT account_id, id FROM messages WHERE folder = 'Trash' AND received_at < ?`
		)
		.bind(cutoff)
		.all();
	const rows = before.results || [];
	if (!rows.length) return 0;

	// Group by account so per-folder counters can be updated in one batch.
	const byAccount = new Map();
	for (const row of rows) {
		if (!byAccount.has(row.account_id)) byAccount.set(row.account_id, []);
		byAccount.get(row.account_id).push(row.id);
	}

	const ids = rows.map((row) => row.id);
	const placeholders = ids.map(() => '?').join(',');
	await db.batch([
		db.prepare(
			`DELETE FROM attachments WHERE message_id IN (${placeholders})`
		).bind(...ids),
		db.prepare(
			`DELETE FROM messages WHERE id IN (${placeholders})`
		).bind(...ids)
	]);

	for (const [accountId] of byAccount) {
		await db
			.prepare(
				`UPDATE folders
				    SET total_count = (SELECT COUNT(*) FROM messages WHERE account_id = ? AND folder = 'Trash'),
				        last_message_at = (SELECT MAX(received_at) FROM messages WHERE account_id = ? AND folder = 'Trash')
				  WHERE account_id = ? AND name = 'Trash'`
			)
			.bind(accountId, accountId, accountId)
			.run();
		// Counter cache will be reconciled by the caller.
	}
	return ids.length;
}

// --- attachments ----------------------------------------------------------

export async function insertAttachment(db, att) {
	await db
		.prepare(
			`INSERT INTO attachments (
				id, account_id, message_id,
				filename, mime_type, size, content_id, r2_key
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			att.id ?? uuid(),
			att.accountId,
			att.messageId,
			att.filename ?? null,
			att.mimeType ?? null,
			att.size ?? 0,
			att.contentId ?? null,
			att.r2Key
		)
		.run();
}

export async function getAttachment(db, accountId, messageId, attachmentId) {
	return db
		.prepare(
			`SELECT a.* FROM attachments a
			 JOIN messages m ON m.id = a.message_id AND m.account_id = a.account_id
			 WHERE a.account_id = ? AND a.message_id = ? AND a.id = ?`
		)
		.bind(accountId, messageId, attachmentId)
		.first();
}

export async function listAttachments(db, accountId, messageId) {
	const result = await db
		.prepare(
			'SELECT * FROM attachments WHERE account_id = ? AND message_id = ? ORDER BY filename'
		)
		.bind(accountId, messageId)
		.all();
	return result.results || [];
}

// --- invite codes ---------------------------------------------------------

export async function findInviteByHash(db, codeHash) {
	return db
		.prepare('SELECT * FROM invite_codes WHERE code_hash = ?')
		.bind(codeHash)
		.first();
}

export async function consumeInvite(db, codeHash, accountId) {
	const now = Date.now();
	await db
		.prepare(
			`UPDATE invite_codes
			    SET consumed_at = ?, consumed_by = ?
			  WHERE code_hash = ? AND consumed_at IS NULL`
		)
		.bind(now, accountId, codeHash)
		.run();
}

export async function listInvites(db) {
	const result = await db
		.prepare(
			`SELECT i.*,
			        creator.email AS created_by_email,
			        consumer.email AS consumed_by_email
			   FROM invite_codes i
			   LEFT JOIN accounts creator ON creator.id = i.created_by
			   LEFT JOIN accounts consumer ON consumer.id = i.consumed_by
			  ORDER BY i.created_at DESC`
		)
		.all();
	return result.results || [];
}

export async function deleteInvite(db, codeHash) {
	return db.prepare('DELETE FROM invite_codes WHERE code_hash = ?').bind(codeHash).run();
}
