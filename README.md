# KRSZ Mail

KRSZ Mail is a private, invite-only email service for `krsz.in`, built on Cloudflare's edge stack: Workers + D1 + R2 + Email Service.
No SMTP, no IMAP, no third-party providers.

## What this is

- Each user registers a local part and gets `<local>@krsz.in`.
- Inbound mail is delivered by Cloudflare Email Routing into the Worker's `email()` handler.
- The handler parses MIME, writes metadata to D1, bodies/attachments to R2.
- Outbound mail is delivered either via the Resend API (external recipients) or directly inside the Worker (intra-domain), depending on the recipient.

## Stack

| Component | Purpose |
|---|---|
| **Cloudflare Worker** | HTTP (SvelteKit SSR + API) and `email()` handler |
| **D1** | accounts, folders, messages, attachments, invite_codes |
| **R2** | message bodies (HTML/text) + attachments |
| **KV** | session tokens, disabled-account flags |
| **Email Routing** | inbound: `*@krsz.in` → worker |
| **Resend API** | outbound to external recipients |

## Status

**Live**

- [x] Invite-only registration (PBKDF2-SHA256 password hashing, 100k iterations)
- [x] JWT session in KV
- [x] Inbound pipeline (postal-mime → D1 + R2)
- [x] Inbox / Sent / Drafts / Trash / Junk / Starred folders
- [x] Read, star, move, mark unread
- [x] Compose with attachments, send via Resend REST API
- [x] Internal `@krsz.in` delivery bypasses Resend so attachments are never blocked
- [x] Search with folder, read/unread, starred, attachments, date range filters
- [x] Auto-updating Inbox (10s polling, visibility-aware)
- [x] Admin user management at `/admin/users` (list, disable/enable, delete)
- [x] Reply, mark unread, delete, iframe-safe body view
- [x] Attachment download with account isolation and safe headers

## Internal delivery

When a sender inside `@krsz.in` sends to another `@krsz.in` account, the Worker writes the message directly to the recipient's D1 + R2. This avoids the upstream bounce that Resend reports for same-domain messages with attachments.

## Admin tooling

- `/admin/users` (admin only): list users, disable / enable accounts, delete accounts and their R2 data.
- The admin cannot disable or delete themselves.
- Disabled accounts are rejected at login and lose their existing session.

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

## Endpoints

| Path | Description |
|---|---|
| `GET /` | Landing |
| `GET /register` / `POST /register` | Sign-up (invite code required) |
| `GET /login` / `POST /login` | Sign-in (rejects disabled accounts) |
| `GET /inbox` | Inbox SSR (auto-refreshing) |
| `GET /{folder}` | Folder view (Sent, Drafts, Trash, Junk, Starred) |
| `GET /{folder}/{id}` | Message detail |
| `GET /compose` / `POST /compose?/send` | New message (with attachments) |
| `GET /search` | Search with filters |
| `GET /settings` | Profile, password, admin invites |
| `GET /admin/users` | Admin user management |
| `POST /logout` | Sign-out |
| `GET /api/health` | Binding status |
| `GET/POST /api/invites` | Admin invite management |
| `GET /api/messages/{id}/body?kind=html\|text` | Read body from R2 |
| `GET /api/messages/{id}/attachments/{aid}` | Download attachment |
| `POST /api/messages/{id}/read` | Toggle \Seen flag |
| `POST /api/messages/{id}/star` | Toggle \Flagged flag |
| `POST /api/messages/{id}/move` | Move to folder |
| `POST /api/messages/send` | Send (JSON API) |
| `DELETE /api/trash` | Empty Trash (account-scoped) |
| `GET/POST/DELETE /api/admin/users` | Admin user management |

## Free-plan caveats

- Workers Free caps PBKDF2 iterations at 100_000 (vs OWASP's 600_000). We use 100_000.
- The Worker seeds its own internal recipient address lookup so intra-domain
  mail (with attachments) is always delivered even when Resend would bounce.

## Layout

```
src/
├── app.d.ts                   # Platform types
├── app.html                   # HTML shell + fonts
├── env.d.ts                   # Worker Env interface
├── hooks.server.ts            # Auth guard, disabled-account check
├── routes/
│   ├── +page.svelte           # Landing
│   ├── +page.server.ts
│   ├── (auth)/
│   │   ├── login/             # Form action
│   │   └── register/          # Invite-only signup
│   ├── (mail)/
│   │   ├── inbox/
│   │   ├── [folder]/
│   │   ├── [folder]/[id]/     # Message detail
│   │   ├── compose/           # Composer with attachments
│   │   ├── search/            # Search with filters
│   │   ├── settings/          # Profile + admin invites
│   │   └── admin/users/       # Admin user management
│   ├── logout/                # POST sign-out
│   └── api/
│       ├── health/
│       ├── invites/
│       ├── admin/users/
│       ├── trash/
│       └── messages/
│           ├── send/
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
        ├── db/queries.js
        └── mail/
            ├── inbound.js      # Plain JS, concatenated by vite plugin
            ├── outbound.js     # Plain JS, with internal delivery
            └── email-routing.js

migrations/0001_init.sql        # D1 schema
wrangler.jsonc                  # Bindings + Worker config
vite.config.ts                  # Injects email() handler into _worker.js
```

## License

Private project.
