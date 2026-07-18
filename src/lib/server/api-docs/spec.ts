// Single source of truth for KRSZ Mail's API documentation.
// Reused by both the JSON endpoint at /api/docs and the in-app HTML guide
// at /api-docs so that the two never drift apart.

export interface ApiFieldSpec {
	name: string;
	type: 'string' | 'integer' | 'boolean' | 'enum' | 'string[]' | 'object';
	required?: boolean;
	description: string;
	values?: readonly string[];
}

export interface ApiEndpointSpec {
	id: string;
	method: string;
	path: string;
	summary: string;
	description: string;
	auth: 'session' | 'admin' | 'public';
	requestFields?: readonly ApiFieldSpec[];
	responseExample?: string;
	notes?: string;
}

export interface ApiSectionSpec {
	id: string;
	title: string;
	tagline: string;
	endpoints: readonly ApiEndpointSpec[];
}

export const API_BASE_PATH = '/api';

export const apiSections: readonly ApiSectionSpec[] = [
	{
		id: 'getting-started',
		title: 'Getting started',
		tagline: 'How requests authenticate and what shape the responses take.',
		endpoints: [
			{
				id: 'authentication',
				method: '—',
				path: '/',
				summary: 'Authentication',
				description:
					'All authenticated endpoints expect the same Session cookie the web UI uses. After signing in at /login, the response Set-Cookie header stores a JWT as `session=...`. Browsers send it back automatically; in scripts, store the cookie jar. Requests without a valid cookie are rejected with 303 to /login (navigational) or 401 JSON (`{"message":"Unauthorized"}`).',
				auth: 'public',
				notes:
					'There is no API-key login. Sessions are minted only through the /login form action. Admins acting via `POST /api/admin/users` must already hold an admin session.'
			},
			{
				id: 'request-format',
				method: '—',
				path: '/',
				summary: 'Request & response format',
				description:
					'Read endpoints return `application/json`. Write endpoints (`POST`, `DELETE`) accept `application/json` with a small JSON body. Standard fields are validated with 400-class errors that include a human-readable `message`. Successful writes respond with `{"ok": true, ...}`.',
				auth: 'public'
			},
			{
				id: 'common-errors',
				method: '—',
				path: '/',
				summary: 'Common error codes',
				description:
					'400 = invalid input, 401 = unauthenticated, 403 = admin role required, 404 = no such message or user, 409 = conflict (last admin, quota exceeded, used invite), 413 = sender quota exceeded, 503 = attachment storage unavailable. Responses are SvelteKit `App.Error` JSON: `{"message": "..."}`.',
				auth: 'public'
			}
		]
	},
	{
		id: 'account',
		title: 'Account & storage',
		tagline: 'Per-user endpoints that read the signed-in mailbox or its quota.',
		endpoints: [
			{
				id: 'get-storage',
				method: 'GET',
				path: '/api/storage',
				summary: 'Get storage quota snapshot',
				description:
					'Returns the storage and message-count usage for the signed-in account. Reconciles the cached counter against reality before responding, so it stays accurate after direct R2 cleanups.',
				auth: 'session',
				responseExample:
					'{\n  "used_bytes": 12345,\n  "quota_bytes": 209715200,\n  "message_count": 42,\n  "quota_messages": 1000,\n  "defaults": { "quota_bytes": 209715200, "quota_messages": 1000 }\n}'
			},
			{
				id: 'empty-trash',
				method: 'DELETE',
				path: '/api/trash',
				summary: 'Permanently empty the Trash folder',
				description:
					'Deletes every message and attachment currently in the Trash folder for the signed-in account. Batched at 1 000 R2 keys per request. Returns the number of rows deleted.',
				auth: 'session',
				responseExample: '{ "ok": true, "deleted": 17 }'
			}
		]
	},
	{
		id: 'messages',
		title: 'Messages',
		tagline: 'Reading, sending, flagging, moving, and bulk operations.',
		endpoints: [
			{
				id: 'send-message',
				method: 'POST',
				path: '/api/messages/send',
				summary: 'Send a message',
				description:
					'Sends an outbound message. Same-zone recipients (`*@<MAIL_DOMAIN>`) are delivered locally to their mailbox; everything else is relayed through Resend. Quotas are checked before send; 413 means the sender is over quota.',
				auth: 'session',
				requestFields: [
					{ name: 'to', type: 'string', required: true, description: 'Comma-separated recipient list. RFC 5322 addresses with display names are accepted.' },
					{ name: 'cc', type: 'string', description: 'Optional CC list, same format as `to`.' },
					{ name: 'bcc', type: 'string', description: 'Optional BCC list, same format as `to`.' },
					{ name: 'subject', type: 'string', required: true, description: 'Subject line; trimmed, no minimum length.' },
					{ name: 'text', type: 'string', description: 'Plain-text body. Provide at least one of `text` or `html`.' },
					{ name: 'html', type: 'string', description: 'HTML body. Falls back to `text` if omitted.' },
					{ name: 'inReplyTo', type: 'string', description: 'Optional message id this is a reply to; used for threading.' }
				],
				responseExample: '{ "ok": true, "messageId": "5b1a..." }'
			},
			{
				id: 'get-message-body',
				method: 'GET',
				path: '/api/messages/{id}/body',
				summary: 'Read a message body',
				description:
					'Returns the decoded body for a message owned by the signed-in account. Use `?kind=text` (default) or `?kind=html`.',
				auth: 'session'
			},
			{
				id: 'download-attachment',
				method: 'GET',
				path: '/api/messages/{id}/attachments/{aid}',
				summary: 'Download an attachment',
				description:
					'Streams a stored attachment. Sets `Content-Disposition: attachment` with the original filename (sanitised) and a `Cache-Control: private, no-store` header.',
				auth: 'session'
			},
			{
				id: 'toggle-read',
				method: 'POST / DELETE',
				path: '/api/messages/{id}/read',
				summary: 'Mark read / unread',
				description:
					'`POST` adds the `\\Seen` flag; `DELETE` removes it. Idempotent — repeated calls are safe.',
				auth: 'session',
				responseExample: '{ "ok": true, "flags": ["\\\\Seen"] }'
			},
			{
				id: 'toggle-star',
				method: 'POST',
				path: '/api/messages/{id}/star',
				summary: 'Toggle the Starred flag',
				description:
					'Adds `\\Flagged` if missing, removes it otherwise. Reads through to the stored message first; returns 404 if the message is not in the account\'s mailbox.',
				auth: 'session',
				responseExample: '{ "ok": true, "flags": ["\\\\Seen", "\\\\Flagged"] }'
			},
			{
				id: 'move-message',
				method: 'POST',
				path: '/api/messages/{id}/move',
				summary: 'Move to another folder',
				description:
					'Moves the message into one of the allowed folders: INBOX, Sent, Drafts, Trash, Junk, or Starred.',
				auth: 'session',
				requestFields: [
					{
						name: 'folder',
						type: 'enum',
						required: true,
						values: ['INBOX', 'Sent', 'Drafts', 'Trash', 'Junk', 'Starred'],
						description: 'Destination folder. The Starred folder is virtual — moving there is equivalent to starring.'
					}
				],
				responseExample: '{ "ok": true }'
			},
			{
				id: 'bulk-update',
				method: 'POST',
				path: '/api/messages/bulk',
				summary: 'Bulk update (Gmail-style multi-select)',
				description:
					'Apply `read | unread | star | unstar | move` to up to 100 messages owned by the signed-in account. All ids are verified to belong to the caller before any update.',
				auth: 'session',
				requestFields: [
					{ name: 'ids', type: 'string[]', required: true, description: '1–100 message ids selected in the UI.' },
					{
						name: 'action',
						type: 'enum',
						required: true,
						values: ['read', 'unread', 'star', 'unstar', 'move'],
						description: 'What to apply to every id.'
					},
					{
						name: 'folder',
						type: 'enum',
						description: 'Required when `action` is `move`. Must be one of INBOX, Sent, Drafts, Trash, Junk.'
					}
				],
				responseExample: '{ "ok": true, "updated": 24, "action": "read", "folder": null }'
			}
		]
	},
	{
		id: 'invites',
		title: 'Invitations (admin)',
		tagline: 'Issue, list, and revoke invite codes. Used codes are kept as account history.',
		endpoints: [
			{
				id: 'list-invites',
				method: 'GET',
				path: '/api/invites',
				summary: 'List invites',
				description:
					'Returns up to 500 most-recent invite rows including the consumer email when the code has been used.',
				auth: 'admin',
				responseExample:
					'{\n  "ok": true,\n  "invites": [\n    {\n      "code_hash": "9f1c…",\n      "local_part": "alice",\n      "created_by_email": "admin@krsz.in",\n      "created_at": 1730000000000,\n      "expires_at": 1732592000000,\n      "consumed_at": 1730100000000,\n      "consumed_by_email": "alice@krsz.in",\n      "notes": "Friend request"\n    }\n  ]\n}'
			},
			{
				id: 'create-invite',
				method: 'POST',
				path: '/api/invites',
				summary: 'Create an invite',
				description:
					'Mints a single-use invite code. The `local_part` is optional — leaving it null lets the registrant pick their own address. The plaintext `code` is returned exactly once.',
				auth: 'admin',
				requestFields: [
					{ name: 'local_part', type: 'string', description: 'Optional reserved local-part. 2–31 chars; lowercase letters, digits, dot, underscore, dash.' },
					{ name: 'expires_in_hours', type: 'integer', description: '1 hour … 365 days. Omit or 0 for no expiry.' },
					{ name: 'notes', type: 'string', description: 'Free-form note up to 240 characters; shown in the admin console.' }
				],
				responseExample:
					'{\n  "ok": true,\n  "code": "AbcD…",\n  "code_hash": "9f1c…",\n  "local_part": "alice",\n  "expires_at": 1732592000000\n}'
			},
			{
				id: 'revoke-invite',
				method: 'DELETE',
				path: '/api/invites',
				summary: 'Revoke an unused invite',
				description:
					'Removes an invite by its `code_hash`. Used codes are retained as account history and cannot be deleted.',
				auth: 'admin',
				requestFields: [
					{ name: 'code_hash', type: 'string', required: true, description: 'SHA-256 hash of the original code, 64 hex chars.' }
				],
				responseExample: '{ "ok": true, "deleted": "9f1c…" }'
			}
		]
	},
	{
		id: 'admin',
		title: 'User administration (admin)',
		tagline: 'Manage accounts, quotas, sessions, and password resets.',
		endpoints: [
			{
				id: 'list-users',
				method: 'GET',
				path: '/api/admin/users',
				summary: 'List all accounts',
				description:
					'Returns every account with `disabled` and `has_session` flags resolved against the KV store. Used by the admin console.',
				auth: 'admin'
			},
			{
				id: 'update-user',
				method: 'POST',
				path: '/api/admin/users',
				summary: 'Mutate one account',
				description:
					'One endpoint, many actions. The `action` field selects which operation runs. The signed-in admin cannot disable, demote, or delete themselves; the last administrator cannot be touched.',
				auth: 'admin',
				requestFields: [
					{ name: 'id', type: 'string', required: true, description: 'Account id (UUID).' },
					{
						name: 'action',
						type: 'enum',
						required: true,
						values: ['disable', 'enable', 'update', 'reset_password', 'revoke_sessions', 'set_quota'],
						description: 'Operation to apply.'
					},
					{ name: 'display_name', type: 'string', description: 'Used by `update`. Up to 80 characters.' },
					{ name: 'role', type: 'enum', values: ['admin', 'user'], description: 'Used by `update`. Promoting a user signs out their other sessions.' },
					{ name: 'password', type: 'string', description: 'Used by `reset_password`. ≥ 6 chars, ≤ 256 chars. Existing session is invalidated.' },
					{ name: 'quota_bytes', type: 'integer', description: 'Used by `set_quota`. Bytes or 0 for unlimited; enforced ≥ 100 MiB otherwise.' },
					{ name: 'quota_messages', type: 'integer', description: 'Used by `set_quota`. Message count or 0 for unlimited; max 50 000.' }
				],
				responseExample: '{ "ok": true, "user": { "id": "…", "role": "user", "quota_bytes": 209715200, "quota_messages": 1000, "disabled": false, "has_session": true } }'
			},
			{
				id: 'delete-user',
				method: 'DELETE',
				path: '/api/admin/users',
				summary: 'Delete an account',
				description:
					'Removes the account, every message it owns, all attachments stored in R2, and its session. Requires the user to re-type the target email address as confirmation. Refuses to run on the caller or the last admin.',
				auth: 'admin',
				requestFields: [
					{ name: 'id', type: 'string', required: true, description: 'Account id to delete.' },
					{ name: 'confirmation', type: 'string', required: true, description: 'Full email address (e.g. `alice@krsz.in`). Must match exactly.' }
				],
				responseExample: '{ "ok": true, "deleted": "54bcf4aa-…" }'
			}
		]
	},
	{
		id: 'system',
		title: 'System',
		tagline: 'Health checks and the docs endpoint itself.',
		endpoints: [
			{
				id: 'health',
				method: 'GET',
				path: '/api/health',
				summary: 'Service health check',
				description:
					'Returns the configured app name plus which bindings exist. Public — no session required. Useful for uptime monitoring.',
				auth: 'public',
				responseExample: '{ "ok": true, "app": "CF WebMail", "bindings": { "DB": true, "SESSIONS": true, "MAIL": true }, "domain": "krsz.in", "ts": 1730000000000 }'
			},
			{
				id: 'docs-json',
				method: 'GET',
				path: '/api/docs',
				summary: 'This documentation as JSON',
				description:
					'Machine-readable version of the same catalog rendered at /api-docs. Useful for generating client SDKs.',
				auth: 'session'
			}
		]
	}
];

export const apiMeta = {
	title: 'KRSZ Mail API',
	tagline:
		'A small, opinionated HTTP API over the same mailboxes the web UI uses. Same endpoints, same quotas, same domain.',
	baseUrl: 'https://mail.krsz.in',
	docsPath: '/api-docs',
	jsonPath: '/api/docs'
} as const;
