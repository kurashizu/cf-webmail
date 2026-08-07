import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getDraft, upsertDraft, deleteDraft, uuid } from '$lib/server/db/queries';

function parseList(raw: unknown): { addr: string; name: null }[] {
	if (!raw) return [];
	const value = String(raw).trim();
	if (!value) return [];
	return value
		.split(/[,\n]+/)
		.map((s) => s.trim())
		.filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
		.map((addr) => ({ addr, name: null }));
}

function safeJson(s: string | null, fallback: never[] = []): any[] {
	if (!s) return fallback;
	try {
		return JSON.parse(s);
	} catch {
		return fallback;
	}
}

function draftBodyKey(accountId: string, id: string): string {
	return `bodies/${accountId}/Drafts/${id}.txt`;
}

const ID_RE = /^[0-9a-f-]{36}$/i;

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const id = String(url.searchParams.get('id') || '');
	if (!id) throw error(400, 'Missing id');
	const draft = await getDraft(platform!.env.DB, locals.user.accountId, id);
	if (!draft) throw error(404, 'Draft not found');
	let text = '';
	if (draft.body_text_key && platform!.env.MAIL) {
		const obj = await platform!.env.MAIL.get(draft.body_text_key);
		if (obj) text = await obj.text();
	}
	return json({
		ok: true,
		draft: {
			id: draft.id,
			to: safeJson(draft.to_addrs, []).map((a: any) => a.addr).join(', '),
			cc: safeJson(draft.cc_addrs, []).map((a: any) => a.addr).join(', '),
			subject: draft.subject || '',
			text
		}
	});
};

export const PUT: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const env = platform!.env;
	const data = (await request.json()) as {
		id?: string;
		to?: string;
		cc?: string;
		subject?: string;
		text?: string;
	};
	const id = data.id && ID_RE.test(data.id) ? data.id : undefined;
	const draftId = id || uuid();
	const toAddrs = parseList(data.to);
	const ccAddrs = parseList(data.cc);
	const text = String(data.text || '');
	const subject = String(data.subject || '').slice(0, 200);
	const bodyTextKey = draftBodyKey(locals.user.accountId, draftId);
	if (env.MAIL) {
		await env.MAIL.put(bodyTextKey, text, {
			httpMetadata: { contentType: 'text/plain; charset=utf-8' }
		});
	}
	await upsertDraft(env.DB, locals.user.accountId, {
		id: draftId,
		toAddrs,
		ccAddrs,
		subject,
		text,
		bodyTextKey
	});
	return json({ ok: true, id: draftId });
};

export const DELETE: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const env = platform!.env;
	const id = String(url.searchParams.get('id') || '');
	if (!id || !ID_RE.test(id)) throw error(400, 'Missing id');
	const key = await deleteDraft(env.DB, locals.user.accountId, id);
	if (key && env.MAIL) {
		try {
			await env.MAIL.delete(key);
		} catch {
			/* best effort */
		}
	}
	return json({ ok: true });
};