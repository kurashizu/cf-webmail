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
	}
