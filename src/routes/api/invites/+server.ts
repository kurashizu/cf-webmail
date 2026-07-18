import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { deleteInvite, findAccountByLocalPart, listInvites } from '$lib/server/db/queries';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/;
const MAX_EXPIRY_HOURS = 24 * 365;

function genCode(len = 20) {
	const buf = crypto.getRandomValues(new Uint8Array(len));
	let out = '';
	for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
	return out;
}

async function sha256Hex(value: string) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(buf))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function requireAdmin(locals: App.Locals) {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');
	return locals.user;
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const admin = requireAdmin(locals);
	const env = platform!.env;
	const data = (await request.json().catch(() => ({}))) as {
		local_part?: string;
		expires_in_hours?: number | null;
		notes?: string;
	};
	const localPart = String(data.local_part || '').trim().toLowerCase();
	const notes = String(data.notes || '').trim();
	const expiryHours = data.expires_in_hours == null || Number(data.expires_in_hours) === 0
		? null
		: Number(data.expires_in_hours);

	if (localPart && !LOCAL_PART_RE.test(localPart)) {
		throw error(400, 'Address must be 2–31 characters using lowercase letters, numbers, dots, underscores, or dashes.');
	}
	if (localPart && await findAccountByLocalPart(env.DB, localPart)) {
		throw error(409, `The address ${localPart}@${env.MAIL_DOMAIN || 'krsz.in'} already exists.`);
	}
	if (notes.length > 240) throw error(400, 'Notes must be 240 characters or fewer.');
	if (expiryHours != null && (!Number.isFinite(expiryHours) || expiryHours < 1 || expiryHours > MAX_EXPIRY_HOURS)) {
		throw error(400, 'Expiration must be between 1 hour and 365 days.');
	}

	const code = genCode();
	const codeHash = await sha256Hex(code);
	const now = Date.now();
	const expiresAt = expiryHours ? now + expiryHours * 60 * 60 * 1000 : null;
	await env.DB.prepare(
		`INSERT INTO invite_codes (code_hash, local_part, created_by, created_at, expires_at, consumed_at, notes)
		 VALUES (?, ?, ?, ?, ?, NULL, ?)`
	)
		.bind(codeHash, localPart || null, admin.accountId, now, expiresAt, notes || null)
		.run();

	return json({ ok: true, code, code_hash: codeHash, local_part: localPart || null, expires_at: expiresAt });
};

export const GET: RequestHandler = async ({ locals, platform }) => {
	requireAdmin(locals);
	const invites = await listInvites(platform!.env.DB);
	return json({ ok: true, invites: invites.slice(0, 500) });
};

export const DELETE: RequestHandler = async ({ locals, platform, request }) => {
	requireAdmin(locals);
	const body = (await request.json().catch(() => ({}))) as { code_hash?: string };
	if (!body.code_hash || !/^[a-f0-9]{64}$/.test(body.code_hash)) throw error(400, 'Invalid invite');

	const invite = await platform!.env.DB.prepare('SELECT consumed_at FROM invite_codes WHERE code_hash = ?')
		.bind(body.code_hash)
		.first<{ consumed_at: number | null }>();
	if (!invite) throw error(404, 'Invite not found');
	if (invite.consumed_at) throw error(409, 'Used invitations are retained as account history and cannot be deleted.');

	await deleteInvite(platform!.env.DB, body.code_hash);
	return json({ ok: true, deleted: body.code_hash });
};
