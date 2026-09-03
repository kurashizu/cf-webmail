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
