// Password hashing for the webmail.
// The user's password is the only secret they have — we never store it in plaintext
// and we never use it to encrypt anything else (there's no IMAP password to wrap).
//
// PBKDF2-SHA256 with a 16-byte salt.
// Iteration count is capped at 100_000 because Cloudflare Workers' SubtleCrypto
// does not support higher iteration counts. (OWASP recommends 600_000 in 2023,
// but the platform limit wins here. 100_000 still meets the older 2017 recommendation.)

const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

/**
 * Generate a 16-byte random salt.
 */
export function newSalt() {
	return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Hash a password with the given salt. Returns a hex string.
 */
export async function hashPassword(password, salt, iterations = ITERATIONS) {
	const enc = new TextEncoder();
	const baseKey = await crypto.subtle.importKey(
		'raw',
		enc.encode(password),
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);

	const bits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt,
			iterations,
			hash: 'SHA-256'
		},
		baseKey,
		KEY_LENGTH_BITS
	);

	return bufferToHex(new Uint8Array(bits));
}

/**
 * Constant-time compare two hex strings.
 */
export function constantTimeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

function bufferToHex(bytes) {
	const out = new Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		out[i] = bytes[i].toString(16).padStart(2, '0');
	}
	return out.join('');
}