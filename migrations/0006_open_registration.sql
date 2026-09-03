-- Migration 0006: open (public) registration with Gemini-assisted abuse review.
--
-- Every account still gets exactly one row at INSERT time (a 'block' verdict
-- never creates a row at all — nothing to clean up, nothing to leak).
-- registration_status distinguishes the three outcomes for invite accounts
-- ('active', default, unaffected by this feature) and open-registration
-- accounts ('active' on an 'allow' verdict, 'pending' on 'review' — gated via
-- the existing SESSIONS `disabled:<id>` KV flag, same mechanism admin
-- disable/enable already uses, so hooks.server.ts needs no changes).
--
-- registration_ip / registration_meta feed the deterministic pre-screen (IP
-- reuse count over the last 7 days) for the *next* registration — never
-- fed wholesale to Gemini, only a computed summary is.

ALTER TABLE accounts ADD COLUMN registration_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE accounts ADD COLUMN registration_via TEXT NOT NULL DEFAULT 'invite';
ALTER TABLE accounts ADD COLUMN registration_ip TEXT;
ALTER TABLE accounts ADD COLUMN registration_note TEXT;
ALTER TABLE accounts ADD COLUMN registration_meta TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_registration_status ON accounts(registration_status, created_at);
CREATE INDEX IF NOT EXISTS idx_accounts_registration_ip ON accounts(registration_ip, created_at);
