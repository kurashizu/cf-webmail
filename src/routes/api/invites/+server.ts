import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { uuid } from '$lib/server/db/queries';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function genCode(len = 16) {
	const buf = crypto.getRandomValues(new Uint8Array(len));
	let out = '';
	for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
	return out;
}

async function sha256Hex(s: string) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');
	const env = platform!.env;

	const data = (await request.json().catch(() => ({}))) as {
		local_part?: string;
		expires_in_hours?: number;
		notes?: string;
	};
	const code = genCode(20);
	const codeHash = await sha256Hex(code);
	const now = Date.now();
	const expires = data.expires_in_hours
		? now + data.expires_in_hours * 60 * 60 * 1000
		: null;
	await env.DB.prepare(
		`INSERT INTO invite_codes (code_hash, local_part, created_by, created_at, expires_at, consumed_at, notes)
		 VALUES (?, ?, ?, ?, ?, NULL, ?)`
	)
		.bind(codeHash, (data.local_part || '').toLowerCase() || null, locals.user.accountId, now, expires, data.notes || null)
		.run();
	return json({ ok: true, code, expires_at: expires });
};

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');
	const result = await platform!.env.DB.prepare(
		'SELECT code_hash, local_part, created_at, expires_at, consumed_at, consumed_by, notes FROM invite_codes ORDER BY created_at DESC LIMIT 200'
	).all();
	return json({ ok: true, invites: result.results || [] });
};
