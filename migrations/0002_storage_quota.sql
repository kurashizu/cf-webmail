-- Migration 0002: per-account storage & message-count quotas.
-- Soft quotas enforced on inbound + outbound paths.
-- Defaults: 200 MiB storage / 1000 messages per member account.

ALTER TABLE accounts ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 209715200;        -- 200 * 1024 * 1024
ALTER TABLE accounts ADD COLUMN quota_messages INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE accounts ADD COLUMN storage_used_bytes INTEGER NOT NULL DEFAULT 0;        -- cached, recomputed by cron / on demand

-- Helpful indexes for recomputeStorageUsed() and quota guards.
CREATE INDEX IF NOT EXISTS idx_messages_account_size ON messages(account_id, size);
CREATE INDEX IF NOT EXISTS idx_attachments_account_size ON attachments(account_id, size);

-- For message-count guard.
CREATE INDEX IF NOT EXISTS idx_messages_account_folder ON messages(account_id, folder);