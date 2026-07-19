// Outbound email pipeline: called from the SvelteKit +server.ts endpoints.
// Plain JS so the inbound/outbound code paths can be concatenated into
// _worker.js by the Vite plugin if needed.

import { bumpFolderOnReceive, findAccountByEmail, findAccountById, insertAttachment, insertMessage, uuid } from '../db/queries.js';
import { assertQuota, addStorageUsed, StorageQuotaError } from '../db/storage.js';

const DEFAULT_DOMAIN = 'krsz.in';

export async function sendOutbound(input, env) {
	try {
		const account = await findAccountById(env.DB, input.accountId);
		if (!account) return { ok: false, error: 'Account not found', status: 404 };

	const to = normaliseList(input.to);
	if (!to.length) return { ok: false, error: 'At least one recipient required', status: 400 };

	const cc = normaliseList(input.cc);
	const bcc = normaliseList(input.bcc);

	// Pre-check: reject if the sender's own mailbox cannot store the outbound copy
	// plus all attachment bytes. Done before any R2 writes / Resend calls.
	const attachments = Array.isArray(input.attachments) ? input.attachments : [];
	const attachmentSize = attachments.reduce((total, attachment) => total + attachment.content.byteLength, 0);
	const outgoingApproxBytes = (input.text?.length || 0) + (input.html?.length || 0) + attachmentSize;
	try {
		await assertQuota(env.DB, input.accountId, outgoingApproxBytes, 1);
	} catch (err) {
		if (err instanceof StorageQuotaError) {
			return {
				ok: false,
				error: `Mailbox ${err.kind} quota exceeded (${err.used}/${err.quota}). Free up space and try again.`,
				status: 413
			};
		}
		throw err;
	}

	const domain = env.MAIL_DOMAIN || DEFAULT_DOMAIN;
	const fromAddress = `${account.local_part}@${domain}`;

	const messageId = `<${uuid()}@${domain}>`;
	const mime = buildMime({
		from: { addr: fromAddress, name: account.display_name || null },
		to,
		cc,
		bcc,
		subject: input.subject,
		text: input.text,
		html: input.html,
		messageId,
		replyToMessageId: input.replyToMessageId
	});

	const folder = 'Sent';
	const newId = uuid();
	const bodyTextKey = bodyKey(input.accountId, folder, newId, 'txt');
	const bodyHtmlKey = bodyKey(input.accountId, folder, newId, 'html');

	const toAddrs = to.map((a) => ({ addr: a, name: null }));
	const ccAddrs = cc.map((a) => ({ addr: a, name: null }));
	const bccAddrs = bcc.map((a) => ({ addr: a, name: null }));
	const preview = (input.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);

	const localRecipients = [];
	const externalRecipients = [];
	for (const recipient of to) {
		const localAccount = recipient.endsWith(`@${domain}`)
			? await findAccountByEmail(env.DB, recipient)
			: null;
		if (localAccount) localRecipients.push({ address: recipient, account: localAccount });
		else externalRecipients.push(recipient);
	}

	let result = { ok: true, status: 200, body: null };
			if (externalRecipients.length) {
				try {
					result = await sendEmail(
						{
							from: fromAddress,
							to: externalRecipients,
							subject: input.subject,
							text: input.text,
							html: input.html,
							replyTo: fromAddress,
							attachments: attachments.map((attachment) => ({
								filename: attachment.filename,
								content: bytesToBase64(attachment.content)
							}))
						},
						env
					);
				} catch (err) {
					return {
						ok: false,
						error: 'Email service temporarily unavailable. Please try again later.',
						status: 502
					};
				}
			}

	if (!result.ok) {
			return {
				ok: false,
				error: extractError(result.body) || 'Email service rejected the message',
				status: result.status
			};
		}

		// Bump sender's cached usage now that the message + attachments are persisted.
		await addStorageUsed(env.DB, input.accountId, outgoingApproxBytes);

		if (env.MAIL) {
		await env.MAIL.put(bodyTextKey, input.text || '', {
			httpMetadata: { contentType: 'text/plain; charset=utf-8' }
		});
		await env.MAIL.put(bodyHtmlKey, input.html || '', {
			httpMetadata: { contentType: 'text/html; charset=utf-8' }
		});
	}

	await insertMessage(env.DB, {
		id: newId,
		accountId: input.accountId,
		folder,
		direction: 'outbound',
		messageId,
		inReplyTo: input.replyToMessageId || null,
		threadId: input.replyToMessageId || null,
		fromAddr: fromAddress,
		fromName: account.display_name || null,
		toAddrs,
		ccAddrs,
		bccAddrs,
		subject: input.subject,
		preview,
		bodyHtmlKey,
		bodyTextKey,
		hasAttachments: attachments.length > 0 ? 1 : 0,
		flags: ['\\Sent'],
		size: mime.length + attachmentSize,
		receivedAt: Date.now()
	});

	for (const attachment of attachments) {
		if (!env.MAIL) break;
		const attachmentId = uuid();
		const key = attachmentKey(input.accountId, newId, attachmentId, attachment.filename);
		await env.MAIL.put(key, attachment.content, {
			httpMetadata: { contentType: attachment.mimeType || 'application/octet-stream' }
		});
		await insertAttachment(env.DB, {
			id: attachmentId,
			accountId: input.accountId,
			messageId: newId,
			filename: attachment.filename,
			mimeType: attachment.mimeType,
			size: attachment.content.byteLength,
			r2Key: key
		});
	}
	for (const recipient of localRecipients) {
		await deliverLocal(
			{
				account: recipient.account,
				fromAddress,
				fromName: account.display_name || null,
				to,
				cc,
				subject: input.subject,
				text: input.text,
				html: input.html,
				messageId,
				attachments
			},
			env
		);
	}

	return { ok: true, messageId };
		} catch (err) {
			console.error('[outbound] send failed:', err);
			return { ok: false, error: 'An unexpected error occurred. Please try again.', status: 500 };
		}
	}

async function deliverLocal(input, env) {
	const folder = 'INBOX';
	const id = uuid();
	const receivedAt = Date.now();

	// Quota guard for the recipient. If full, silently drop the local copy —
	// the external Resend delivery has already been (or will be) made, so the
	// recipient can still pick up the message via their other inbox. We surface
	// this through a flag so callers can log/alert if they want.
	const deliveryBytes =
		(input.text?.length || 0) +
		(input.html?.length || 0) +
		input.attachments.reduce((sum, item) => sum + item.content.byteLength, 0);
	try {
		await assertQuota(env.DB, input.account.id, deliveryBytes, 1);
	} catch (err) {
		if (err instanceof StorageQuotaError) {
			console.warn('[outbound] local recipient over quota, dropping local copy', {
				recipient: input.account.email,
				kind: err.kind,
				used: err.used,
				quota: err.quota
			});
			return { ok: false, reason: 'quota' };
		}
		throw err;
	}

	const bodyTextKey = bodyKey(input.account.id, folder, id, 'txt');
	const bodyHtmlKey = bodyKey(input.account.id, folder, id, 'html');
	if (env.MAIL) {
		await env.MAIL.put(bodyTextKey, input.text || '', { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
		await env.MAIL.put(bodyHtmlKey, input.html || '', { httpMetadata: { contentType: 'text/html; charset=utf-8' } });
	}
	await insertMessage(env.DB, {
			id,
			accountId: input.account.id,
			folder,
			direction: 'inbound',
			messageId: input.messageId,
			threadId: input.messageId,
			fromAddr: input.fromAddress,
			fromName: input.fromName,
			toAddrs: input.to.map((address) => ({ addr: address, name: null })),
			ccAddrs: input.cc.map((address) => ({ addr: address, name: null })),
			subject: input.subject,
			preview: (input.text || '').replace(/\s+/g, ' ').trim().slice(0, 200),
			bodyHtmlKey,
			bodyTextKey,
			hasAttachments: input.attachments.length > 0 ? 1 : 0,
			flags: [],
			size: deliveryBytes,
			receivedAt
		});
	for (const attachment of input.attachments) {
		if (!env.MAIL) break;
		const attachmentId = uuid();
		const key = attachmentKey(input.account.id, id, attachmentId, attachment.filename);
		await env.MAIL.put(key, attachment.content, { httpMetadata: { contentType: attachment.mimeType || 'application/octet-stream' } });
		await insertAttachment(env.DB, {
					id: attachmentId,
					accountId: input.account.id,
					messageId: id,
					filename: attachment.filename,
					mimeType: attachment.mimeType,
					size: attachment.content.byteLength,
					r2Key: key
				});
			}
			await addStorageUsed(env.DB, input.account.id, deliveryBytes);
			await bumpFolderOnReceive(env.DB, input.account.id, folder, receivedAt);
			return { ok: true };
		}

function bodyKey(accountId, folder, messageId, kind) {
	return `bodies/${accountId}/${folder}/${messageId}.${kind === 'html' ? 'html' : 'txt'}`;
}

function attachmentKey(accountId, messageId, attachmentId, filename) {
	const safe = String(filename || 'attachment').replace(/[^A-Za-z0-9._-]+/g, '_');
	return `attachments/${accountId}/${messageId}/${attachmentId}-${safe}`;
}

function bytesToBase64(value) {
	const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

function normaliseList(v) {
	if (!v) return [];
	const values = Array.isArray(v) ? v : String(v).split(/[,\n]+/);
	return values.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

function extractError(body) {
	if (!body) return null;
	if (Array.isArray(body.errors) && body.errors.length) {
		return body.errors.map((e) => e.message || JSON.stringify(e)).join('; ');
	}
	if (typeof body.message === 'string') return body.message;
	if (typeof body.error === 'string') return body.error;
	if (typeof body === 'string') return body;
	return null;
}

export async function sendEmail(input, env) {
	if (!env.RESEND_API_KEY) {
		throw new Error('Email sending is not configured (missing RESEND_API_KEY)');
	}

	const payload = {
		from: input.from,
		to: Array.isArray(input.to)
			? input.to
			: String(input.to).split(/[,\n]+/).map((s) => s.trim()).filter(Boolean),
		subject: input.subject
	};
	if (input.text) payload.text = input.text;
	if (input.html) payload.html = input.html;
	if (input.replyTo) payload.reply_to = input.replyTo;
	if (input.attachments?.length) payload.attachments = input.attachments;

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	let body;
	try {
		body = await res.json();
	} catch {
		body = { raw: await res.text() };
	}
	return { ok: res.ok, status: res.status, body };
}

export function buildMime({ from, to, cc = [], bcc = [], subject, text, html, messageId, replyToMessageId }) {
	const lines = [];
	lines.push(`Message-ID: ${messageId}`);
	lines.push(`Date: ${new Date().toUTCString()}`);
	lines.push(`From: ${formatAddress(from)}`);
	for (const t of to) lines.push(`To: <${t}>`);
	for (const c of cc) lines.push(`Cc: <${c}>`);
	for (const b of bcc) lines.push(`Bcc: <${b}>`);
	lines.push(`Subject: ${encodeHeader(subject || '')}`);
	if (replyToMessageId) lines.push(`In-Reply-To: <${replyToMessageId}>`);
	lines.push(`MIME-Version: 1.0`);
	lines.push(`Content-Type: multipart/alternative; boundary="cf-webmail-boundary"`);
	lines.push('');
	lines.push('--cf-webmail-boundary');
	lines.push('Content-Type: text/plain; charset=utf-8');
	lines.push('Content-Transfer-Encoding: 8bit');
	lines.push('');
	lines.push(text || '');
	lines.push('');
	lines.push('--cf-webmail-boundary');
	lines.push('Content-Type: text/html; charset=utf-8');
	lines.push('Content-Transfer-Encoding: 8bit');
	lines.push('');
	lines.push(html || '');
	lines.push('');
	lines.push('--cf-webmail-boundary--');
	lines.push('');
	return lines.join('\r\n');
}

function formatAddress(a) {
	if (!a) return '';
	if (a.name) return `"${escapeName(a.name)}" <${a.addr}>`;
	return `<${a.addr}>`;
}

function escapeName(name) {
	return name.replace(/["\\]/g, '\\$&');
}

function encodeHeader(s) {
	if (/^[\x20-\x7e]*$/.test(s)) return s;
	const b64 = btoa(unescape(encodeURIComponent(s)));
	return `=?UTF-8?B?${b64}?=`;
}
