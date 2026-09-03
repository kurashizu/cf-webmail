// Audit log writer. Fire-and-forget via ctx.waitUntil() at every call site —
// a failed audit write must never break the user-facing action it's
// recording. Plain JS so outbound.js (concatenated by hand in some contexts)
// can import it without a TS toolchain in the way; see AGENTS.md's
// Plain-JS boundary notes for why some server modules stay untyped.

/**
 * @param {D1Database} db
 * @param {{
 *   accountId?: string|null, actorEmail?: string|null, event: string,
 *   targetAccountId?: string|null, targetEmail?: string|null,
 *   detail?: Record<string, unknown>|null, ip?: string|null
 * }} entry
 */
export async function writeAudit(db, entry) {
	try {
		await db
			.prepare(
				`INSERT INTO audit_log (
					id, account_id, actor_email, event,
					target_account_id, target_email, detail, ip, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				crypto.randomUUID(),
				entry.accountId ?? null,
				entry.actorEmail ?? null,
				entry.event,
				entry.targetAccountId ?? null,
				entry.targetEmail ?? null,
				entry.detail ? JSON.stringify(entry.detail) : null,
				entry.ip ?? null,
				Date.now()
			)
			.run();
	} catch (error) {
		// Never let a logging failure surface to the caller — this runs from
		// ctx.waitUntil(), off the request's response path, so there's no user
		// waiting on it anyway.
		console.error('[audit] write failed', {
			event: entry.event,
			error: error instanceof Error ? error.message : String(error)
		});
	}
}

/**
 * Convenience: schedule the write via ctx.waitUntil if available, otherwise
 * await it inline (e.g. contexts without an ExecutionContext, like tests).
 * @param {ExecutionContext|undefined} ctx
 * @param {D1Database} db
 * @param {Parameters<typeof writeAudit>[1]} entry
 */
export function auditAsync(ctx, db, entry) {
	const promise = writeAudit(db, entry);
	if (ctx && typeof ctx.waitUntil === 'function') {
		ctx.waitUntil(promise);
	} else {
		// Best effort — don't let an unhandled rejection escape.
		promise.catch(() => {});
	}
}

export const AUDIT_EVENTS = /** @type {const} */ ([
	'login',
	'login_failed',
	'logout',
	'register',
	'register_blocked',
	'send_outbound',
	'password_change',
	'profile_update',
	'admin.disable',
	'admin.enable',
	'admin.revoke_sessions',
	'admin.update',
	'admin.reset_password',
	'admin.set_quota',
	'admin.set_storage_backend',
	'admin.delete_user',
	'admin.create_invite',
	'admin.delete_invite',
	'admin.approve_registration',
	'admin.reject_registration'
]);
