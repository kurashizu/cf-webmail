// See https://svelte.dev/docs/kit/types#app.d.ts
import type { KVNamespace, D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Locale } from '$lib/i18n/locale';

declare global {
	namespace App {
		interface Locals {
			user: {
				email: string;
				accountId: string;
				role: 'admin' | 'user';
				sid: string;
			} | null;
			locale: Locale;
		}

		interface Platform {
			env: {
				// Storage
				DB: D1Database;
				MAIL?: R2Bucket;
				SESSIONS: KVNamespace;

				// Vars
								APP_NAME: string;
								MAIL_DOMAIN: string;
								ACCOUNT_ID: string;
								MAIL_ZONE_ID: string;
								WORKER_NAME: string;
				DEFAULT_PAGE_SIZE: string;
				MAX_ATTACHMENT_SIZE: string;

				// Second storage backend — self-hosted S3-compatible (MinIO), used
				// for accounts with accounts.storage_backend = 'minio_s3'.
				S3_ENDPOINT?: string;
				S3_BUCKET?: string;
				S3_REGION?: string;
				S3_ACCESS_KEY_ID?: string;
				S3_SECRET_ACCESS_KEY?: string;

				// Open registration — Turnstile human check + Gemini abuse review.
				TURNSTILE_SITE_KEY?: string;
				TURNSTILE_SECRET_KEY?: string;
				GEMINI_API_KEY?: string;
				// Optional override for the model reviewRegistration() calls — falls
				// back to abuse-review.js's DEFAULT_GEMINI_MODEL when unset, so this
				// can be changed by editing wrangler.jsonc's vars, no code change.
				GEMINI_MODEL?: string;

				// Secrets
				JWT_SECRET: string;
				RESEND_API_KEY: string;
				CF_API_TOKEN: string;
			};
			context: ExecutionContext;
			cf: IncomingRequestCfProperties;
		}
	}
}

export {};
