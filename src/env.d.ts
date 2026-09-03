// Cloudflare Workers env bindings type — used in server code that doesn't
// have an App.RequestEvent (e.g. inside Rpc helpers).
/// <reference types="@cloudflare/workers-types" />

interface Env {
	DB: D1Database;
	MAIL?: R2Bucket;
	SESSIONS: KVNamespace;
	APP_NAME: string;
	MAIL_DOMAIN: string;
	ACCOUNT_ID: string;
	DEFAULT_PAGE_SIZE: string;
	MAX_ATTACHMENT_SIZE: string;
	JWT_SECRET: string;
	RESEND_API_KEY: string;
	CF_API_TOKEN: string;
		MAIL_ZONE_ID: string;
		WORKER_NAME: string;
		// Second storage backend — self-hosted S3-compatible (MinIO), used for
		// accounts with accounts.storage_backend = 'minio_s3'.
		S3_ENDPOINT?: string;
		S3_BUCKET?: string;
		S3_REGION?: string;
		S3_ACCESS_KEY_ID?: string;
		S3_SECRET_ACCESS_KEY?: string;
		// Open registration — Turnstile human check + Gemini abuse review.
		TURNSTILE_SITE_KEY?: string;
		TURNSTILE_SECRET_KEY?: string;
		GEMINI_API_KEY?: string;
		GEMINI_MODEL?: string;
	}
