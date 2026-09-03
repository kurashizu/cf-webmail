-- Migration 0004: per-account storage backend selection.
-- Every account is pinned to exactly one backend for its whole lifetime —
-- message bodies and attachments already written under one backend are
-- never migrated by this column changing. 'r2' is the historical default
-- (existing accounts + invite-only registration); 'minio_s3' is available
-- for the open-registration path and admin override.

ALTER TABLE accounts ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'r2';
