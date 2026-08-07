import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { sendOutbound } from '$lib/server/mail/outbound';
import { getDraft, deleteDraft } from '$lib/server/db/queries';

const ID_RE = /^[0-9a-f-]{36}$/i;

function parseAddrs(s: string | null): string[] {
	if (!s) return [];
	try {
		const arr = JSON.parse(s);
		return Array.isArray(arr) ? arr.map((a: any) => a.addr).filter(Boolean) : [];
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const env = platform!.env;

	const prefill: { to: string; cc: string; subject: string; text: string } = {
		to: String(url.searchParams.get('to') || '').slice(0, 320),
		cc: '',
		subject: String(url.searchParams.get('subject') || '').slice(0, 200),
		text: ''
	};

	// Editing an existing draft: prefill from it and keep the same draft id so
	// autosave keeps updating the same row.
	let draftId = '';
	const requested = String(url.searchParams.get('draft') || '');
	if (requested && ID_RE.test(requested)) {
		const draft = await getDraft(env.DB, locals.user.accountId, requested);
		if (draft) {
			draftId = requested;
			const tos = parseAddrs(draft.to_addrs);
			const ccs = parseAddrs(draft.cc_addrs);
			let text = '';
			if (draft.body_text_key && env.MAIL) {
				const obj = await env.MAIL.get(draft.body_text_key);
				if (obj) text = await obj.text();
			}
			prefill.to = tos.join(', ');
			prefill.cc = ccs.join(', ');
			prefill.subject = draft.subject || '';
			prefill.text = text;
		}
	}

	return {
		user: locals.user,
		domain: env.MAIL_DOMAIN || 'krsz.in',
		draftId,
		prefill
	};
};

export const actions: Actions = {
	send: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/login');
		const env = platform!.env;
		const data = await request.formData();
		const to = String(data.get('to') || '').trim();
		const subject = String(data.get('subject') || '').trim();
		const body = String(data.get('body') || '');
		const draftId = String(data.get('draft_id') || '').trim();
		const maxAttachmentSize = Number(env.MAX_ATTACHMENT_SIZE || 26_214_400);
		const files = data
			.getAll('attachments')
			.filter((value): value is File => value instanceof File && value.size > 0);
		const totalAttachmentSize = files.reduce((total, file) => total + file.size, 0);

		if (!to || !subject || !body) {
			return fail(400, { error: 'To, subject, and body are required' });
		}


		if (files.length > 20) {
			return fail(400, { error: 'You can attach up to 20 files per message.' });
		}
		if (totalAttachmentSize > maxAttachmentSize) {
			return fail(413, { error: 'Attachments exceed the 25 MB total limit.' });
		}

		const attachments = await Promise.all(
			files.map(async (file) => ({
				filename: file.name || 'attachment',
				mimeType: file.type || 'application/octet-stream',
				content: new Uint8Array(await file.arrayBuffer())
			}))
		);

		const text = body;
		const html = body
			.split(/\n{2,}/)
			.map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
			.join('\n');

		const result = await sendOutbound(
			{
				accountId: locals.user.accountId,
				to,
				subject,
				text,
				html,
				attachments
			},
			env
		);
		if (!result.ok) {
			return fail(result.status || 500, { error: result.error || 'Send failed' });
		}
		// Sent successfully — drop the autosaved draft if one existed.
		if (draftId && ID_RE.test(draftId)) {
			try {
				const key = await deleteDraft(env.DB, locals.user.accountId, draftId);
				if (key && env.MAIL) await env.MAIL.delete(key);
			} catch {
				/* non-fatal */
			}
		}
		throw redirect(303, '/sent');
	}
};

function escape(s: string) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
