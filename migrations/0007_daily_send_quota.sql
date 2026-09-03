-- Migration 0007: per-account daily outbound send quota.
--
-- daily_send_quota is the cap (0 = unlimited, matching the existing
-- quota_bytes/quota_messages convention). daily_send_count/daily_send_day
-- track usage for the *current* day only — daily_send_day is a day number
-- (Date.now() / 86400000, floored), and a reserve just resets the count to
-- 1 whenever the stored day no longer matches today, rather than needing a
-- separate cron job to zero every account out at midnight.

ALTER TABLE accounts ADD COLUMN daily_send_quota INTEGER NOT NULL DEFAULT 10;
ALTER TABLE accounts ADD COLUMN daily_send_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN daily_send_day INTEGER NOT NULL DEFAULT 0;
