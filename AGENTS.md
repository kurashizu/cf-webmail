# AGENTS.md

Notes for AI coding agents (and humans) working on this repo.

## What this is

KRSZ Mail is an invite-only webmail for `krsz.in` running entirely on the
Cloudflare free stack (Workers + D1 + R2 + KV + Email Routing). External
outbound goes via Resend; intra-domain delivery is in-Worker.

The codebase is SvelteKit (TypeScript) + plain ESM `.js` files for the parts
the Vite plugin concatenates into the Worker bundle. See the **Plain-JS
boundary** section below.

## Key commands

```bash
pnpm install
pnpm exec vite build                 # builds + injects email/scheduled handlers
pnpm dlx wrangler@4.112.0 deploy     # 4.111.0 hits error 10013 on assets upload
pnpm dlx wrangler@4.112.0 d1 migrations apply cf-webmail-db --remote
pnpm run check                       # svelte-check; pre-existing errors OK (see below)
```

Production URL: `https://cf-webmail.kurashizu123.workers.dev`
Custom domain: `krsz.in` (zone `409d8fcbeeaaf3ee7b4be2f8f626b440`)
Live D1: `357038c4-8c0d-4dc3-9a29-97c2c9ad1f4f`
KV `SESSIONS`: `757683a8bedf4c53bd20854f6e0f27bb`
R2: `cf-webmail-mail`

## Layout

```
src/
├── app.d.ts, app.html, env.d.ts
├── hooks.server.ts                  # JWT auth, disabled-account check
├── routes/
│   ├── +page.svelte                 # Landing
│   ├── (auth)/{login,register}/
│   ├── (mail)/
│   │   ├── inbox/                   # Auto-refresh + storage banner
│   │   ├── [folder]/                # Generic folder + storage banner
│   │   ├── [folder]/[id]/           # Message detail
│   │   ├── compose/                 # Composer + quota projection
│   │   ├── search/                  # Search with filters
│   │   ├── settings/                # Profile / password / storage card
│   │   └── admin/users/             # Admin console + quota editor
│   └── api/
│       ├── health/
│       ├── storage/                 # GET quota snapshot (self)
│       ├── invites/
│       ├── admin/users/             # Admin CRUD + set_quota
│       ├── trash/                   # Empty Trash + reconcile
│       └── messages/{send,bulk,[id]/...}/
└── lib/
    ├── components/AuthShell.svelte
    ├── format.ts, types.ts
    ├── styles/{theme,global}.css
    └── server/
        ├── auth/session.js
        ├── crypto/kdf.js
        ├── cron/maintenance.js      # Trash retention + storage reconciliation
        ├── db/{queries.js,storage.js}
        └── mail/{inbound.js,outbound.js,email-routing.js}

migrations/0001_init.sql
migrations/0002_storage_quota.sql   # quota_bytes, quota_messages, storage_used_bytes
vite.config.ts                       # Injects email() + scheduled() handlers
wrangler.jsonc                       # Bindings + cron "0 3 * * *"
```

## Plain-JS boundary

`src/lib/server/mail/inbound.js`, `src/lib/server/mail/outbound.js`,
`src/lib/server/db/queries.js`, `src/lib/server/db/storage.js`,
`src/lib/server/cron/maintenance.js` must stay **plain ESM JavaScript**:

- No TypeScript syntax (no type annotations, no `as`, no `interface`).
- `import` paths stay relative (`./queries.js`, `../db/storage.js`).
- They get concatenated by the `cf-webmail:inject-email-handler` Vite plugin
  in `vite.config.ts` into `_worker.js` for the Worker's `email()` and
  `scheduled()` handlers, bypassing Vite's TS compilation.
- TypeScript modules in `src/routes/**` import them through `$lib/server/...`
  and SvelteKit/Vite handles both copies — that is fine, Vite de-dupes.

If you add TS-only syntax to one of these files, the worker bundle breaks at
deploy (or silently at runtime). Keep them plain.

## Quota system

Per-account soft caps enforced on every inbound and outbound write:

- `accounts.quota_bytes` — default `200 MiB`; range `[100 MiB, 10 GiB]`; `0` = unlimited.
- `accounts.quota_messages` — default `1000`; range `[0, 50000]`; `0` = unlimited.
- `accounts.storage_used_bytes` — cached `SUM(messages.size) + SUM(attachments.size)`;
  maintained incrementally on writes and reconciled nightly by the cron handler.

Guard points:

1. `src/lib/server/mail/inbound.js` — cheap fast-fail on raw RFC822 size before
   parsing, then a precise post-parse check including attachment bytes.
   Over-quota → `message.setReject('Mailbox full')`.
2. `src/lib/server/mail/outbound.js` `sendOutbound()` — sender pre-check.
   Over-quota → returns `{ ok: false, status: 413, error: 'Mailbox {kind} quota exceeded...' }`.
3. `outbound.js` `deliverLocal()` — recipient check. Over-quota → drops the
   local copy but the external Resend path still proceeds if the sender's quota allows.

UI surfaces:

- `/settings` Storage card (progress bar + counts).
- `/inbox` and `/[folder]` banners at `>=85%` (high) / `>=95%` (critical).
- `/compose` pre-send projection warning when send would exceed quota.
- `/admin/users` drawer has an Edit Quota modal (MB + message count, `0` = unlimited).

Cron `scheduled()` runs at `0 3 * * *`:

- Empty Trash older than 30 days: gather R2 keys, batch-delete, then DELETE
  messages + attachments, update folder counter.
- Reconcile every account's `storage_used_bytes` against reality. Only writes
  back if drift > 1 MiB.

The default 200 MiB cap is a deliberate tenant-level cap. With the Free plan's
10 GB R2 limit, that gives comfortable headroom for ~40 active users.

## Testing — DO NOT touch production accounts

Real accounts that exist in the live D1 **must not be deleted, password-changed,
quota-reduced, or otherwise modified during testing**:

- `admin@krsz.in`     — `4d6a636c-0374-4334-9b88-bd67e40622d8`
- `panicake@krsz.in`  — `54bcf4aa-19a9-46b1-be88-3e8dc86c5c68`
- `test@krsz.in`      — `6f72cab8-6916-47a9-ba49-8966ab6088fd`
- `hhsdd@krsz.in`     — `3faffe5a-e494-4286-bfb6-d592d3223181`

Their R2 message bodies and attachments must also not be deleted. If you need
to test something destructive, **create a temporary account via the invite API**:

```bash
# 1. As admin, create an invite (admin-only).
curl -b /tmp/cj -X POST https://cf-webmail.kurashizu123.workers.dev/api/invites \
  -H 'content-type: application/json' \
  -d '{"local_part":"tmp-foo","expires_in_hours":24,"notes":"agent test"}'

# 2. Register with the returned code.
curl -b /tmp/cj -X POST https://cf-webmail.kurashizu123.workers.dev/register \
  -F 'invite=<CODE>' -F 'local_part=tmp-foo' \
  -F 'password=tmp-Pass2026!' -F 'confirm_password=tmp-Pass2026!'

# 3. After tests, delete via admin console / API (admin can delete any account).
curl -b /tmp/cj -X DELETE https://cf-webmail.kurashizu123.workers.dev/api/admin/users \
  -H 'content-type: application/json' \
  -d '{"id":"<accountId>","confirmation":"tmp-foo@krsz.in"}'
```

**Don't** reset existing passwords directly via SQL to test login flows — you
will lock the real user out. Always log in through the form action with a
known password, or use a fresh temporary account.

**Don't** delete messages / attachments for existing accounts from R2 or D1
even when testing "delete" code paths. Use a temporary account.

**Don't** lower the quota on `admin@krsz.in` to test "mailbox full" — admin's
inbox is small but its quota change will silently shift on next reconciliation.
Use a temporary account with `quota_bytes` clamped via `set_quota` action.

### Synthetic test paths

The codebase used to ship `/api/test/inbound` and `/api/test/quota` endpoints
for verifying quota guards without depending on the email routing chain. They
were removed before the public release; reintroduce behind an admin-only guard
if needed. Alternative: create a temporary account, log in, and use the real
`/api/messages/send` and admin `set_quota` endpoints — that exercises the
production code paths.

### Wrangler gotchas

- `wrangler@4.111.0` → `error code: 10013` on Workers Assets upload.
  Pin `wrangler@4.112.0` (or newer) in deploy commands.
- Cloudflare KV is eventually consistent (≈ 60 s globally) — when writing a
  session token via `wrangler kv key put` and then immediately calling the
  Worker, you can hit a 303 redirect. Wait, or use the form-based login flow
  which writes the cookie in-band.
- Cross-site POST form submissions are forbidden by SvelteKit's CSRF guard.
  curl-based tests must send `Origin: https://cf-webmail.kurashizu123.workers.dev`
  and a matching `Referer`.

### OAuth token for ad-hoc Cloudflare API calls

If you need to call the Cloudflare API directly (e.g. to inspect Email
Routing rules), the OAuth token from `wrangler whoami` lives at
`~/.config/.wrangler/config/default.toml` under `oauth_token`. It has scopes
for `email_routing:write`, `workers:write`, `d1:write`, etc. Treat it as a
secret — don't commit it.

## Pre-existing svelte-check errors

`pnpm run check` reports 30 TypeScript errors that are pre-existing in the
codebase (mostly `requestJson(...)` returning `unknown` in admin pages and a
couple of `event.dataTransfer` null checks). They were present before the
quota work and are not introduced by recent changes. Don't try to "fix" them
opportunistically — that's out of scope. If you add new code, follow the same
patterns (don't introduce *new* errors).

## Validation checklist after edits

1. `pnpm run build` — must succeed; vite plugin must log
   `[cf-webmail] Injected email() handler + mail bundle into _worker.js`.
2. `pnpm dlx wrangler@4.112.0 deploy` — must succeed; check `schedule: 0 3 * * *`
   is in the deploy output.
3. Smoke-test `GET /api/health` — should return `{"ok":true,...,"bindings":{"DB":true,"SESSIONS":true,"MAIL":true},...}`.
4. If you touched `inbound.js` / `outbound.js` / `queries.js` / `storage.js`
   / `cron/maintenance.js`: deploy, then create a temp account and exercise
   the affected path (send, receive, empty trash, change quota, etc.).

## License

MIT. See [`LICENSE`](LICENSE).
