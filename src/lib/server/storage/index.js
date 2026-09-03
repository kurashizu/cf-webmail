// Storage backend router: every account is pinned to exactly one backend
// (accounts.storage_backend, migration 0004) for its whole lifetime. This
// picks the right adapter given either an account row or a backend string.

import { createR2Storage } from './r2.js';
import { createS3Storage } from './s3.js';

export const STORAGE_BACKENDS = ['r2', 'minio_s3'];
export const DEFAULT_STORAGE_BACKEND = 'r2';

/**
 * @param {string|null|undefined} backend
 * @param {any} env
 */
export function getStorage(backend, env) {
	if (backend === 'minio_s3') {
		if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
			throw new Error('minio_s3 backend is not configured (missing S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)');
		}
		return createS3Storage({
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION || 'us-east-1',
			bucket: env.S3_BUCKET,
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY
		});
	}
	// Default / 'r2' / anything unrecognised falls back to R2 — the
	// historical, always-configured backend.
	if (!env.MAIL) return null;
	return createR2Storage(env.MAIL);
}

/** Convenience: resolve storage straight from an accounts row. */
export function getStorageForAccount(account, env) {
	return getStorage(account?.storage_backend, env);
}

/**
 * Non-throwing configuration check — getStorage() throws on a misconfigured
 * minio_s3 backend (so call sites that expect the adapter never see a
 * half-working client), which makes it unsuitable for a plain boolean guard.
 */
export function isStorageConfigured(backend, env) {
	if (backend === 'minio_s3') {
		return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
	}
	return Boolean(env.MAIL);
}
