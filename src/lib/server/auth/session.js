// JWT signing/verification + KV-backed multi-device session store.
// Uses the `jose` library (Edge-runtime compatible).
//
// Each login gets its own session id (`sid`), embedded in the JWT. All of an
// account's active sessions are tracked together in a single KV document
// (`sessions:${accountId}`) — a small JSON array of {sid, token, lastSeen,
// createdAt} — rather than one KV key per session, because KV has no way to
// list-and-sort keys by recency cheaply. Capped at MAX_SESSIONS; logging in
// past the cap evicts the least-recently-seen session (LRU), so a device
// that's been idle the longest is the one that gets signed out, not
// necessarily the oldest login.

import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'cf-webmail';
const AUDIENCE = 'cf-webmail';
const TTL_SECONDS = 60 * 60 * 24; // 24h
const MAX_SESSIONS = 20;

function secretKey(secret) {
	return new TextEncoder().encode(secret);
}

function newSessionId() {
	return crypto.randomUUID();
}

/**
 * Sign a session JWT. Generates a fresh session id unless one is passed in
 * (re-signing the same device's session, e.g. after a password change).
 * @param {{ accountId: string, email: string, role?: string, sid?: string }} payload
 * @param {string} secret
 * @returns {Promise<{ token: string, sid: string }>}
 */
export async function signSession(payload, secret) {
	const sid = payload.sid || newSessionId();
	const token = await new SignJWT({ ...payload, sid })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(`${TTL_SECONDS}s`)
		.sign(secretKey(secret));
	return { token, sid };
}

/**
 * Verify and decode a session JWT.
 */
export async function verifySession(token, secret) {
	const { payload } = await jwtVerify(token, secretKey(secret), {
		issuer: ISSUER,
		audience: AUDIENCE
	});

	if (typeof payload.accountId !== 'string' || typeof payload.email !== 'string') {
		throw new Error('Invalid payload');
	}
	return {
		accountId: payload.accountId,
		email: payload.email,
		role: typeof payload.role === 'string' ? payload.role : 'user',
		sid: typeof payload.sid === 'string' ? payload.sid : null
	};
}

function sessionsKey(accountId) {
	return `sessions:${accountId}`;
}

/** @returns {Promise<Array<{sid: string, token: string, lastSeen: number, createdAt: number, userAgent?: string|null}>>} */
async function readSessionList(kv, accountId) {
	const raw = await kv.get(sessionsKey(accountId));
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

async function writeSessionList(kv, accountId, list) {
	await kv.put(sessionsKey(accountId), JSON.stringify(list), { expirationTtl: TTL_SECONDS });
}

/**
 * Register a new session for a device, evicting the least-recently-seen
 * session if the account is already at MAX_SESSIONS.
 * @param {string} accountId
 * @param {string} sid
 * @param {string} token
 * @param {string|null} [userAgent]
 */
export async function registerSession(kv, accountId, sid, token, userAgent) {
	let list = await readSessionList(kv, accountId);
	const now = Date.now();
	list = list.filter((s) => s.sid !== sid);
	list.push({ sid, token, lastSeen: now, createdAt: now, userAgent: userAgent || null });
	if (list.length > MAX_SESSIONS) {
		list.sort((a, b) => b.lastSeen - a.lastSeen);
		list = list.slice(0, MAX_SESSIONS);
	}
	await writeSessionList(kv, accountId, list);
}

/**
 * Check that (sid, token) matches an active session for this account, and
 * bump its lastSeen so LRU eviction reflects real activity.
 */
export async function isSessionValid(kv, accountId, sid, token) {
	const list = await readSessionList(kv, accountId);
	const entry = list.find((s) => s.sid === sid);
	if (!entry || entry.token !== token) return false;

	// Throttle the lastSeen write to once per 5 minutes per session — every
	// authenticated request runs this check, and writing to KV on every one
	// would multiply write volume for no real LRU-precision benefit.
	if (Date.now() - entry.lastSeen > 5 * 60 * 1000) {
		entry.lastSeen = Date.now();
		await writeSessionList(kv, accountId, list);
	}
	return true;
}

/**
 * Sign out one device (the one holding `sid`), leaving other devices' active
 * sessions untouched.
 */
export async function destroySession(kv, accountId, sid) {
	const list = await readSessionList(kv, accountId);
	const next = list.filter((s) => s.sid !== sid);
	if (next.length === list.length) return;
	await writeSessionList(kv, accountId, next);
}

/**
 * Sign out every device for this account (e.g. after a password change).
 */
export async function destroyAllSessions(kv, accountId) {
	await kv.delete(sessionsKey(accountId));
}

/**
 * List active sessions for an account (for a "manage devices" UI), without
 * exposing the raw tokens.
 */
export async function listSessions(kv, accountId) {
	const list = await readSessionList(kv, accountId);
	return list
		.map((s) => ({ sid: s.sid, lastSeen: s.lastSeen, createdAt: s.createdAt, userAgent: s.userAgent || null }))
		.sort((a, b) => b.lastSeen - a.lastSeen);
}

/**
 * Cheap existence check for the admin users list — whether this account has
 * any device currently signed in, without needing the full session list.
 */
export async function hasActiveSessions(kv, accountId) {
	const list = await readSessionList(kv, accountId);
	return list.length > 0;
}
