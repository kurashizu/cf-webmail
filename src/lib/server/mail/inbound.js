// Inbound email pipeline: called from the `email()` handler.
// Plain JS (no TS annotations) so it can be concatenated into _worker.js
// by the Vite plugin without going through TS compilation.

import { findAccountByLocalPart, ensureFolders, insertMessage, insertAttachment, bumpFolderOnReceive, uuid } from '../db/queries.js';

async function handleInbound(message, env, ctx) {
	const recipient = (message.to || '').trim().toLowerCase();
	const at = recipient.indexOf('@');
	if (at < 0) {
		console.warn('[inbound] recipient missing @, rejecting', recipient);
		message.setReject('Invalid recipient');
		return;
	}
	const localPart = recipient.slice(0, at);
	const account = await findAccountByLocalPart(env.DB, localPart);
	if (!account) {
		console.warn('[inbound] unknown recipient', recipient);
		message.setReject('No such mailbox');
		return;
	}

	const accountId = account.id;
	await ensureFolders(env.DB, accountId);

	// Read raw stream into a buffer for parsing + size measurement.
	const rawBuf = await readAll(message.raw);
	const size = rawBuf.byteLength;

	const parsed = await parseEmail(rawBuf);

	const messageId = cleanMessageId(parsed.messageId);
	const inReplyTo = cleanMessageId(parsed.inReplyTo);
	const threadId = inReplyTo || messageId || null;

	const fromList = normaliseAddresses(parsed.from);
	const replyToList = normaliseAddresses(parsed.replyTo);
	const parsedFrom = fromList[0] || null;
	const envelopeFrom = String(message.from || '').toLowerCase();
	const isResendEnvelope = envelopeFrom.endsWith(`@send.${env.MAIL_DOMAIN || 'krsz.in'}`);
	const preferredFrom = isResendEnvelope && replyToList[0] ? replyToList[0] : parsedFrom;
	const fromAddr = preferredFrom?.addr || message.from;
	const fromName = preferredFrom?.name || null;
	const toAddrs = normaliseAddresses(parsed.to);
	const ccAddrs = normaliseAddresses(parsed.cc);
	const subject = parsed.subject || '(no subject)';
	const preview = buildPreview(parsed);

	const folder = 'INBOX';
	const newId = uuid();
	const flags = [];

	let bodyHtmlKey = null;
	let bodyTextKey = null;
	const attachmentRecords = Array.isArray(parsed.attachments)
		? parsed.attachments.map((att) => {
			const id = uuid();
			const filename = att.filename || 'attachment';
			const data = toBytes(att.content);
			return {
				id,
				filename,
				mimeType: att.mimeType || 'application/octet-stream',
				data,
				contentId: att.contentId ? stripCid(att.contentId) : null,
				r2Key: attachmentKey(accountId, newId, id, filename)
			};
		})
		: [];

	const storedKeys = [];
	try {
		if (parsed.html) {
			bodyHtmlKey = bodyKey(accountId, folder, newId, 'html');
			await env.MAIL.put(bodyHtmlKey, parsed.html, {
				httpMetadata: { contentType: 'text/html; charset=utf-8' }
			});
			storedKeys.push(bodyHtmlKey);
		}
		if (parsed.text) {
			bodyTextKey = bodyKey(accountId, folder, newId, 'txt');
			await env.MAIL.put(bodyTextKey, parsed.text, {
				httpMetadata: { contentType: 'text/plain; charset=utf-8' }
			});
			storedKeys.push(bodyTextKey);
		}

		for (const att of attachmentRecords) {
			await env.MAIL.put(att.r2Key, att.data, {
				httpMetadata: { contentType: att.mimeType }
			});
			storedKeys.push(att.r2Key);
		}

		const receivedAt = parseDate(parsed.date) || Date.now();
		const inserted = await insertMessage(env.DB, {
			id: newId,
			accountId,
			folder,
			direction: 'inbound',
			messageId,
			inReplyTo,
			threadId,
			fromAddr,
			fromName,
			toAddrs,
			ccAddrs,
			subject,
			preview,
			bodyHtmlKey,
			bodyTextKey,
			hasAttachments: attachmentRecords.length ? 1 : 0,
			flags,
			size,
			receivedAt
		});

		if (!inserted) {
			await deleteStoredObjects(env.MAIL, storedKeys);
			console.info('[inbound] duplicate message ignored', { recipient, messageId });
			return;
		}

		for (const att of attachmentRecords) {
			await insertAttachment(env.DB, {
				id: att.id,
				accountId,
				messageId: newId,
				filename: att.filename,
				mimeType: att.mimeType,
				size: att.data.byteLength,
				contentId: att.contentId,
				r2Key: att.r2Key
			});
		}

		await bumpFolderOnReceive(env.DB, accountId, folder, receivedAt);
	} catch (error) {
		await env.DB.prepare('DELETE FROM attachments WHERE account_id = ? AND message_id = ?').bind(accountId, newId).run().catch(() => {});
		await env.DB.prepare('DELETE FROM messages WHERE account_id = ? AND id = ?').bind(accountId, newId).run().catch(() => {});
		await deleteStoredObjects(env.MAIL, storedKeys);
		console.error('[inbound] persistence failed', {
			recipient,
			messageId,
			attachmentCount: attachmentRecords.length,
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
}

function bodyKey(accountId, folder, messageId, kind) {
	return `bodies/${accountId}/${folder}/${messageId}.${kind === 'html' ? 'html' : 'txt'}`;
}

function attachmentKey(accountId, messageId, attachmentId, filename) {
	const safe = (filename || 'attachment').replace(/[^A-Za-z0-9._-]+/g, '_');
	return `attachments/${accountId}/${messageId}/${attachmentId}-${safe}`;
}

function toBytes(content) {
	if (content instanceof Uint8Array) return content;
	if (content instanceof ArrayBuffer) return new Uint8Array(content);
	if (ArrayBuffer.isView(content)) {
		return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
	}
	if (typeof content === 'string') return new TextEncoder().encode(content);
	throw new TypeError('Unsupported attachment content type');
}

async function deleteStoredObjects(bucket, keys) {
	if (!bucket || !keys.length) return;
	try {
		await bucket.delete(keys);
	} catch (error) {
		console.error('[inbound] cleanup failed', {
			keys: keys.length,
			error: error instanceof Error ? error.message : String(error)
		});
	}
}

function cleanMessageId(v) {
	if (!v) return null;
	const s = String(v).trim();
	if (s.startsWith('<') && s.endsWith('>')) return s.slice(1, -1);
	return s || null;
}

function stripCid(v) {
	return v.replace(/^<|>$/g, '').replace(/^cid:/i, '');
}

function parseDate(v) {
	if (!v) return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : t;
}

function stripHtml(html) {
	if (!html) return '';
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, ' ')
		.trim();
}

function buildPreview(parsed) {
	const text = parsed.text || stripHtml(parsed.html || '');
	if (!text) return '';
	return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function normaliseAddresses(addrs) {
	if (!addrs) return [];
	if (typeof addrs === 'string') return [{ addr: addrs, name: null }];
	if (Array.isArray(addrs)) return addrs.flatMap(normaliseAddresses);
	if (typeof addrs !== 'object') return [];
	if (Array.isArray(addrs.value)) return addrs.value.flatMap(normaliseAddresses);

	const addr = addrs.address || addrs.addr || null;
	if (!addr) return [];
	return [{ addr, name: addrs.name || null }];
}

async function readAll(stream) {
	if (!stream) return new Uint8Array(0);
	if (stream instanceof Uint8Array) return stream;
	if (stream instanceof ArrayBuffer) return new Uint8Array(stream);
	if (typeof stream.getReader === 'function') {
		const reader = stream.getReader();
		const chunks = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.byteLength ?? value.length ?? 0;
		}
		const out = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			out.set(c, offset);
			offset += c.byteLength ?? c.length ?? 0;
		}
		return out;
	}
	return new Uint8Array(0);
}

async function parseEmail(raw) {
	const parser = new PostalMime();
	return await parser.parse(raw);
}

export { handleInbound };
