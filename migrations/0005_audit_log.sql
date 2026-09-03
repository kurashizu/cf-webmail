-- Migration 0005: audit log for admin actions + user account/send events.
-- Retention is enforced by the nightly cron (runMaintenance), not by SQL —
-- rows older than 90 days are deleted there alongside the Trash sweep.

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  account_id TEXT,            -- actor; NULL for system/unauthenticated events (e.g. failed login)
  actor_email TEXT,           -- redundant copy so the log stays readable after account deletion
  event TEXT NOT NULL,        -- e.g. 'login', 'login_failed', 'logout', 'register', 'send_outbound',
                               -- 'password_change', 'profile_update', 'admin.disable', 'admin.set_quota'
  target_account_id TEXT,     -- admin actions: the account acted upon
  target_email TEXT,
  detail TEXT,                 -- JSON blob, event-specific (recipient count, via_resend, error, etc.)
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_log(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event, created_at);
