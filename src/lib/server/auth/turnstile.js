// Cloudflare Turnstile server-side verification for the public registration
// form. This is the hard gate against scripted signups — Gemini review only
// ever sees requests that already passed this check.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {{ secretKey: string, token: string, ip: string|null }} input
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile({ secretKey, token, ip }) {
	if (!token) return false;
	try {
		const body = new URLSearchParams({ secret: secretKey, response: token });
		if (ip) body.set('remoteip', ip);
		const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
		if (!res.ok) return false;
		const data = await res.json();
		return data?.success === true;
	} catch (err) {
		console.error('[turnstile] verification request failed', err instanceof Error ? err.message : err);
		return false;
	}
}
