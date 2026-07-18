# KRSZ Mail

KRSZ Mail is an invite-only email service for `krsz.in`, built on Cloudflare's edge stack: Workers + D1 + R2 + KV + Email Routing.
Inbound mail and the application control plane run on Cloudflare. External outbound delivery uses the Resend API; mail between local accounts is delivered directly inside the Worker.

## What this is

- Each user registers a local part and gets `<local>@krsz.in`.
- Inbound mail is delivered by Cloudflare Email Routing into the Worker's `email()` handler.
- The handler parses MIME, writes metadata to D1, bodies/attachments to R2.
- Outbound mail is delivered either via the Resend API (external recipients) or directly inside the Worker (intra-domain), depending on the recipient.
- Every account has a soft storage quota and message-count quota; both inbound and outbound paths enforce them.

## Stack

| Component | Purpose |
|---|---|
| **Cloudflare Worker** | HTTP (SvelteKit SSR + API), `email()` handler, `scheduled()` cron handler |
| **D1** | accounts, folders, messages, attachments, invite_codes |
| **R2** | message bodies (HTML/text) + attachments |
| **KV** | session tokens, disabled-account flags, email-routing recipient cache |
| **Email Routing** | inbound: `*@krsz.in` → worker |
| **Resend API** | outbound to external recipients |
| **Cron trigger** | nightly Trash retention (30 d) + storage reconciliation |

## Status

**Live**

- [x] Invite-only registration (PBKDF2-SHA256 password hashing, 100k iterations)
- [x] JWT session in KV with disabled-account revocation
- [x] Inbound pipeline (postal-mime → D1 + R2) with pre- and post-parse quota checks
- [x] Outbound pipeline (Resend for external, in-Worker for intra-domain)
- [x] Inbox / Sent / Drafts / Trash / Junk / Starred folders
- [x] Read, star, move, mark unread
- [x] Compose with multipart attachments (drag/drop, 20-file / 25 MB caps)
- [x] Internal `@krsz.in` delivery bypasses Resend so attachments are never blocked
- [x] Search with folder, read/unread, starred, attachments, date range filters
- [x] Auto-updating Inbox (10s polling, visibility-aware)
- [x] Bulk message selection and read/unread, star/unstar, Trash/Inbox actions
- [x] Reply, mark unread, delete, iframe-safe body view
- [x] Attachment download with account isolation and safe headers
- [x] Per-account storage and message-count quotas (default 200 MiB / 1000 messages, admin-overridable; 0 = unlimited)
- [x] Settings page Storage card with progress bar (green / amber / red)
- [x] Inbox + folder banner at >=85% / critical >=95%, dismissable
- [x] Compose-time quota projection warning before send
- [x] Admin user management with quotas, invitations, profiles, roles, password resets, sessions, access, deletion
- [x] Nightly cron: empty Trash older than 30 days, reconcile cached usage vs. reality

## Quotas

Soft per-account caps enforced on inbound and outbound:

- `accounts.quota_bytes` (default `200 * 1024 * 1024` = 200 MiB) — minimum 100 MiB when set, `0` = unlimited
- `accounts.quota_messages` (default `1000`) — maximum 50000, `0` = unlimited
- `accounts.storage_used_bytes` — cached `SUM(messages.size) + SUM(attachments.size)`, maintained incrementally on writes and reconciled nightly

Limits are read at:

1. Inbound (`email()` handler): raw RFC822 byte check before parsing (cheap fast-fail) + precise check after parsing (raw + attachments). When over, the message is `setReject('Mailbox full')` so the sender gets a bounce.
2. Outbound `sendOutbound()`: pre-check sender's mailbox before any R2 writes or Resend calls. Returns HTTP 413 with a human-readable message.
3. `deliverLocal()` (intra-domain): recipient quota check; if full, the local copy is dropped but the external Resend delivery still proceeds (if the sender's quota allows).

UI surfaces:

- `/settings` → Storage card: bar + used / quota / available + messages count.
- `/inbox`, `/{folder}` → high/critical banner (>=85% / >=95%) with a "Manage" link.
- `/compose` → pre-send warning when the projected size or message count would push the user over.
- `/admin/users` → Storage column with progress bar; drawer has an "Edit quota" modal that accepts MB and message counts and supports unlimited.

Cron (`scheduled()` handler, `0 3 * * *`):

- Empty Trash older than 30 days: gather R2 keys for expired trash, batch-delete, then DELETE messages + attachments, update folder counter.
- Reconcile every account's `storage_used_bytes` against `SUM(messages.size) + SUM(attachments.size)`; only writes back if drift > 1 MiB.

## Internal delivery

When a sender inside `@krsz.in` sends to another `@krsz.in` account, the Worker writes the message directly to the recipient's D1 + R2 via `deliverLocal()`. This avoids the upstream bounce that Resend reports for same-domain messages with attachments and lets the recipient's quota be enforced independently of the sender's.

## Admin tooling

- `/admin/users` (admin only): tabs for Users and Invitations.
- Per-user drawer: profile, role, password reset, force sign-out, disable / enable, danger-zone delete (email-typed confirmation).
- Self-protection and last-administrator guards prevent accidental lockout.
- Disabled accounts are rejected at login and lose their existing session via the `disabled:<accountId>` KV key.
- Storage quota override per account (MB, `0` = unlimited) + message-count override.

## Domain setup

`krsz.in` must be on Cloudflare with Email Routing enabled. The catch-all rule

```
*@krsz.in  →  Worker: cf-webmail
```

delivers everything into the `email()` handler. Existing verified destination
addresses (in Email Routing → Addresses) can be used as outbound recipients
on the Workers Free plan.

## Local development

```bash
pnpm install
pnpm exec vite build               # builds + injects email() handler
pnpm exec wrangler dev --port 8787 # simulates bindings locally
```

`.dev.vars` must include `JWT_SECRET`. `RESEND_API_KEY` is needed for outbound
sending. `CF_API_TOKEN` is needed for any future Email Routing rule management
(a Cloudflare API token with `email_routing:write` scope).

## Deployment

```bash
pnpm exec wrangler d1 migrations apply cf-webmail-db --remote
pnpm exec wrangler deploy
pnpm exec wrangler secret put CF_API_TOKEN
pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put RESEND_API_KEY
```

> Wrangler `4.111.0` hits `error code: 10013` on Workers Assets upload; use
> `4.112.0` or later. The deploy command above is the same — just install
> `wrangler@4.112.0` (or newer) via `pnpm dlx wrangler@4.112.0 deploy`.

## Endpoints

| Path | Description |
|---|---|
| `GET /` | Landing |
| `GET /register` / `POST /register` | Sign-up (invite code required) |
| `GET /login` / `POST /login` | Sign-in (rejects disabled accounts) |
| `GET /inbox` | Inbox SSR (auto-refreshing, quota banner) |
| `GET /{folder}` | Folder view (Sent, Drafts, Trash, Junk, Starred), quota banner |
| `GET /{folder}/{id}` | Message detail |
| `GET /compose` / `POST /compose?/send` | New message (with attachments, pre-send quota warning) |
| `GET /search` | Search with filters |
| `GET /settings` | Profile, password, storage quota |
| `GET /admin/users` | Admin user management (with quota editor) |
| `POST /logout` | Sign-out |
| `GET /api/health` | Binding status |
| `GET /api/storage` | Current user's quota + usage snapshot |
| `GET/POST/DELETE /api/invites` | Admin invite management |
| `GET /api/messages/{id}/body?kind=html\|text` | Read body from R2 |
| `GET /api/messages/{id}/attachments/{aid}` | Download attachment |
| `POST /api/messages/{id}/read` | Toggle `\Seen` flag |
| `POST /api/messages/{id}/star` | Toggle `\Flagged` flag |
| `POST /api/messages/{id}/move` | Move to folder |
| `POST /api/messages/bulk` | Bulk message actions |
| `DELETE /api/trash` | Empty Trash (account-scoped, reconciles storage cache) |
| `GET/POST/DELETE /api/admin/users` | Admin user management (`set_quota` action for storage / message limits) |

## Free-plan caveats

- Workers Free caps PBKDF2 iterations at 100_000 (vs OWASP's 600_000). We use 100_000.
- The Worker seeds its own internal recipient address lookup so intra-domain
  mail (with attachments) is always delivered even when Resend would bounce.
- Cron triggers fire on the Free plan but are limited to once per 5 minutes.
  Daily (`0 3 * * *`) is plenty for Trash retention + storage reconciliation.
- D1 row limit is 5 GB and R2 object limit is 10 GB total on the Free plan;
  the per-account 200 MiB cap keeps the total tenant footprint predictable.

## Layout

```
src/
├── app.d.ts                          # Platform types
├── app.html                          # HTML shell + fonts
├── env.d.ts                          # Worker Env interface
├── hooks.server.ts                   # Auth guard, disabled-account check
├── routes/
│   ├── +page.svelte                  # Landing
│   ├── +page.server.ts
│   ├── (auth)/
│   │   ├── login/                    # Form action
│   │   └── register/                 # Invite-only signup
│   ├── (mail)/
│   │   ├── inbox/                    # Auto-refreshing inbox + storage banner
│   │   ├── [folder]/                 # Folder view + storage banner
│   │   ├── [folder]/[id]/            # Message detail
│   │   ├── compose/                  # Composer with attachments + quota warning
│   │   ├── search/                   # Search with filters
│   │   ├── settings/                 # Profile, password, storage card
│   │   └── admin/users/              # Admin user management + quota editor
│   ├── logout/                       # POST sign-out
│   └── api/
│       ├── health/
│       ├── storage/                  # GET quota snapshot (self)
│       ├── invites/
│       ├── admin/users/              # Admin user CRUD + set_quota
│       ├── trash/                    # Empty Trash + reconcile usage
│       └── messages/
│           ├── send/
│           ├── bulk/                 # Bulk read/unread/star/move
│           └── [id]/
│               ├── body/
│               ├── read/
│               ├── star/
│               ├── move/
│               └── attachments/{aid}/
└── lib/
    ├── components/AuthShell.svelte
    ├── format.ts
    ├── types.ts
    ├── styles/{theme,global}.css
    └── server/
        ├── auth/session.js
        ├── crypto/kdf.js
        ├── cron/maintenance.js       # Trash retention + storage reconciliation
        ├── db/
        │   ├── queries.js            # D1 helpers (plain JS, vite-bundled)
        │   └── storage.js            # Quota guards + cache reconciliation
        └── mail/
            ├── inbound.js            # Plain JS, concatenated by vite plugin
            ├── outbound.js           # Plain JS, with internal delivery
            └── email-routing.js

migrations/
├── 0001_init.sql                     # Accounts, folders, messages, attachments, invites
└── 0002_storage_quota.sql            # quota_bytes, quota_messages, storage_used_bytes
wrangler.jsonc                       # Bindings + Worker config + cron triggers
vite.config.ts                       # Injects email() + scheduled() handlers into _worker.js
```

## How inbound and outbound are wired

`vite.config.ts` ships a Vite plugin (`cf-webmail:inject-email-handler`) that runs in `closeBundle`:

1. Reads `src/lib/server/mail/inbound.js` and `src/lib/server/db/queries.js`,
   strips their internal imports, and concatenates them into `_worker.js`.
2. Adds an `import PostalMime from 'postal-mime'` and the runtime glue:
   - `__cfWebmailEmail(message, env, ctx)` wraps `handleInbound` and `setReject`s on failure.
   - `__cfWebmailScheduled(event, env, ctx)` runs `runMaintenance(env, ctx)` via `ctx.waitUntil`.
3. Renames `worker_default` → `__skDefault` and re-exports a fresh default
   `{ fetch, email, scheduled }`.

That keeps `inbound.js` and `queries.js` as plain ESM (no TS-only syntax) so
they bundle cleanly into the Workers runtime, while the rest of the codebase
uses TypeScript through the standard SvelteKit / Vite pipeline.

## License

MIT. See [`LICENSE`](LICENSE).
