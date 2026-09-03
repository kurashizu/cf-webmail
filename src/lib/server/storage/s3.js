// Minimal S3-compatible client for Cloudflare Workers: hand-rolled AWS
// SigV4 over fetch (the Node AWS SDK needs Node's crypto/stream APIs that
// aren't available in the Workers runtime). Path-style addressing
// (https://endpoint/bucket/key) for MinIO and other self-hosted S3 stores
// that don't do virtual-hosted-style DNS.
//
// Plain JS (no TS annotations) so the Vite plugin can concatenate this into
// _worker.js for the email() handler path alongside inbound.js/outbound.js.

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

function hex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function sha256Hex(data) {
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return hex(digest);
}

async function hmac(keyBytes, message) {
	const key = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return new Uint8Array(sig);
}

function amzDate(now = new Date()) {
	const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
	return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodeRfc3986(s) {
	return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Encode an object key for a URL path, keeping '/' as a path separator. */
function encodeKeyPath(key) {
	return key.split('/').map(encodeRfc3986).join('/');
}

/**
 * Build and send a single signed S3 request.
 * @param {{
 *   endpoint: string, region: string, bucket: string,
 *   accessKeyId: string, secretAccessKey: string
 * }} config
 * @param {{ method: string, key: string, body?: BodyInit|null, contentType?: string, extraHeaders?: Record<string,string> }} req
 */
async function signedRequest(config, req) {
	const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config;
	const base = new URL(endpoint);
	const url = new URL(`${base.origin}/${bucket}/${encodeKeyPath(req.key)}`);
	const host = url.host;

	const { amzDate: xAmzDate, dateStamp } = amzDate();
	const payloadHash = req.body != null ? await sha256Hex(await toBytes(req.body)) : await sha256Hex('');

	const headers = new Headers(req.extraHeaders || {});
	headers.set('host', host);
	headers.set('x-amz-date', xAmzDate);
	headers.set('x-amz-content-sha256', payloadHash);
	if (req.contentType) headers.set('content-type', req.contentType);

	const sortedHeaderNames = [...headers.keys()].sort();
	const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers.get(name).trim()}\n`).join('');
	const signedHeaders = sortedHeaderNames.join(';');

	const canonicalRequest = [
		req.method,
		url.pathname,
		'',
		canonicalHeaders,
		signedHeaders,
		payloadHash
	].join('\n');

	const scope = `${dateStamp}/${region}/s3/aws4_request`;
	const stringToSign = [
		'AWS4-HMAC-SHA256',
		xAmzDate,
		scope,
		await sha256Hex(canonicalRequest)
	].join('\n');

	const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
	const kRegion = await hmac(kDate, region);
	const kService = await hmac(kRegion, 's3');
	const kSigning = await hmac(kService, 'aws4_request');
	const signature = hex(await hmac(kSigning, stringToSign));

	headers.set(
		'authorization',
		`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
	);

	return fetch(url.toString(), { method: req.method, headers, body: req.body ?? undefined });
}

async function toBytes(body) {
	if (body == null) return new Uint8Array(0);
	if (body instanceof Uint8Array) return body;
	if (body instanceof ArrayBuffer) return new Uint8Array(body);
	if (typeof body === 'string') return new TextEncoder().encode(body);
	throw new TypeError('Unsupported S3 request body type');
}

/**
 * Create an S3-compatible storage adapter with the same put/get/delete
 * shape the rest of the codebase already uses against R2Bucket, so call
 * sites don't need backend-specific branches.
 */
export function createS3Storage(config) {
	return {
		backend: 'minio_s3',

		/** @param {string} key @param {Uint8Array|ArrayBuffer|string} data @param {{httpMetadata?: {contentType?: string}}} [opts] */
		async put(key, data, opts = {}) {
			const bytes = await toBytes(data);
			const res = await signedRequest(config, {
				method: 'PUT',
				key,
				body: bytes,
				contentType: opts.httpMetadata?.contentType || 'application/octet-stream'
			});
			if (!res.ok) {
				throw new Error(`S3 put failed for ${key}: ${res.status} ${await res.text().catch(() => '')}`);
			}
		},

		/** @param {string} key */
		async get(key) {
			const res = await signedRequest(config, { method: 'GET', key });
			if (res.status === 404) return null;
			if (!res.ok) {
				throw new Error(`S3 get failed for ${key}: ${res.status} ${await res.text().catch(() => '')}`);
			}
			const sizeHeader = res.headers.get('content-length');
			return {
				body: res.body,
				// 0, not undefined, when the backend's response omits
				// Content-Length — callers that blindly String() this into an
				// HTTP header must never get the literal string "undefined".
				size: sizeHeader ? Number(sizeHeader) : 0,
				httpMetadata: { contentType: res.headers.get('content-type') || undefined },
				text: () => res.text(),
				arrayBuffer: () => res.arrayBuffer()
			};
		},

		/** @param {string|string[]} keys */
		async delete(keys) {
			const list = Array.isArray(keys) ? keys : [keys];
			// MinIO/S3 batch delete needs a POST to ?delete with an XML body and
			// its own payload hash; plain per-object DELETE is simpler and the
			// call sites already chunk to <=1000 keys for R2 parity, so issue
			// them individually (Workers can run these concurrently).
			await Promise.all(
				list.map(async (key) => {
					const res = await signedRequest(config, { method: 'DELETE', key });
					if (!res.ok && res.status !== 404) {
						throw new Error(`S3 delete failed for ${key}: ${res.status} ${await res.text().catch(() => '')}`);
					}
				})
			);
		}
	};
}
