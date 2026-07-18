// JWT signing/verification + KV-backed session store.
// Uses the `jose` library (Edge-runtime compatible).

import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'cf-webmail';
const AUDIENCE = 'cf-webmail';
const TTL_SECONDS = 60 * 60 * 24; // 24h

function secretKey(secret) {
	return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT.
 * @param {{ accountId: string, email: string, role?: string }} payload
 * @param {string} secret
 */
export async function signSession(payload, secret) {
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(`${TTL_SECONDS}s`)
		.sign(secretKey(secret));
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
		role: typeof payload.role === 'string' ? payload.role : 'user'
	};
}

/**
 * Register a session in KV (for revocation).
 */
export async function registerSession(kv, accountId, token) {
	await kv.put(`session:${accountId}`, token, { expirationTtl: TTL_SECONDS });
}

/**
 * Check that the given token matches what's currently in KV (not revoked).
 */
export async function isSessionValid(kv, accountId, token) {
	const stored = await kv.get(`session:${accountId}`);
	return stored === token;
}

/**
 * Destroy a session.
 */
export async function destroySession(kv, accountId) {
	await kv.delete(`session:${accountId}`);
}
