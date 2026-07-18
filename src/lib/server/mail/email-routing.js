// Cloudflare Email Routing rule manager.
// Used by /api/invites (admin) and the register action to add or remove
// per-address worker rules automatically when a new mailbox is created.

import { json } from '@sveltejs/kit';

const CACHE_PREFIX = 'cf_email_rules';
const CACHE_TTL = 60; // seconds

/**
 * Fetch all Email Routing rules for a zone (cached briefly in KV).
 */
async function listRules(env) {
	if (!env.ACCOUNT_ID || !env.CF_API_TOKEN) return [];
	if (!env.MAIL_ZONE_ID) return [];

	const cacheKey = `${CACHE_PREFIX}:${env.MAIL_ZONE_ID}`;
	if (env.SESSIONS) {
		const cached = await env.SESSIONS.get(cacheKey);
		if (cached) {
			try {
				return JSON.parse(cached);
			} catch {}
		}
	}

	const res = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${env.MAIL_ZONE_ID}/email/routing/rules`,
		{ headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } }
	);
	if (!res.ok) {
		console.error('[email-rules] list failed:', res.status, await res.text());
		return [];
	}
	const data = await res.json();
	const list = data.result || [];
	if (env.SESSIONS) {
		await env.SESSIONS.put(cacheKey, JSON.stringify(list), { expirationTtl: CACHE_TTL });
	}
	return list;
}

async function invalidateCache(env) {
	if (env.SESSIONS && env.MAIL_ZONE_ID) {
		await env.SESSIONS.delete(`${CACHE_PREFIX}:${env.MAIL_ZONE_ID}`);
	}
}

/**
 * Create a literal rule for `address@krsz.in` that routes to the `cf-webmail`
 * worker. No-op if a rule for that address already exists.
 *
 * @returns {Promise<{ ok: boolean, ruleId?: string, existed?: boolean, error?: string }>}
 */
export async function ensureWorkerRule(address, env) {
	if (!env.ACCOUNT_ID || !env.CF_API_TOKEN) {
		return { ok: false, error: 'Email Routing API not configured (CF_API_TOKEN / ACCOUNT_ID)' };
	}
	if (!env.MAIL_ZONE_ID) {
		return { ok: false, error: 'MAIL_ZONE_ID not set' };
	}

	const existing = await listRules(env);
	const found = existing.find((r) =>
		r.enabled &&
		r.matchers?.some(
			(m) =>
				m.type === 'literal' &&
				m.field === 'to' &&
				(m.value || '').toLowerCase() === address.toLowerCase()
		)
	);
	if (found) return { ok: true, existed: true, ruleId: found.id };

	const res = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${env.MAIL_ZONE_ID}/email/routing/rules`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.CF_API_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name: `webmail-${address.split('@')[0]}`,
				matchers: [{ type: 'literal', field: 'to', value: address }],
				actions: [{ type: 'worker', value: [env.WORKER_NAME || 'cf-webmail'] }],
				enabled: true,
				priority: 0
			})
		}
	);
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		const msg = data?.errors?.[0]?.message || `HTTP ${res.status}`;
		return { ok: false, error: msg };
	}
	await invalidateCache(env);
	return { ok: true, ruleId: data?.result?.id };
}

/**
 * Remove the literal worker rule for `address@krsz.in`.
 */
export async function removeWorkerRule(address, env) {
	if (!env.ACCOUNT_ID || !env.CF_API_TOKEN || !env.MAIL_ZONE_ID) {
		return { ok: false, error: 'Email Routing API not configured' };
	}
	const existing = await listRules(env);
	const found = existing.find((r) =>
		r.matchers?.some(
			(m) =>
				m.type === 'literal' &&
				m.field === 'to' &&
				(m.value || '').toLowerCase() === address.toLowerCase()
		)
	);
	if (!found) return { ok: true, existed: false };
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${env.MAIL_ZONE_ID}/email/routing/rules/${found.id}`,
		{ method: 'DELETE', headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } }
	);
	await invalidateCache(env);
	return { ok: res.ok, ruleId: found.id };
}

/**
 * Helper for /api/health diagnostics.
 */
export async function listEnabledRules(env) {
	const all = await listRules(env);
	return all.filter((r) => r.enabled);
}