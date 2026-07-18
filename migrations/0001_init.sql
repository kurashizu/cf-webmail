-- Migration 0001: initial schema for hosted email (no IMAP, Cloudflare-native).
-- One account per registered user; one mailbox table; folders stored as strings.
-- Account can also be linked to an external alias address (forwarded into this inbox).

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,                       -- uuid
  local_part TEXT UNIQUE NOT NULL,           -- e.g. "kurashizu" -> kurashizu@krsz.in
  email TEXT UNIQUE NOT NULL,                -- full address
  display_name TEXT,                         -- friendly name
  password_hash TEXT NOT NULL,               -- PBKDF2-SHA256 hash (hex)
  password_salt BLOB NOT NULL,               -- 16 bytes
  password_iters INTEGER NOT NULL DEFAULT 100000,
  role TEXT NOT NULL DEFAULT 'user',         -- 'admin' / 'user'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_local_part ON accounts(local_part);

-- Default folders for every account: INBOX, Sent, Drafts, Trash, Junk, Starred.
-- Stored as rows so we can later add per-folder settings (page size, retention).
CREATE TABLE IF NOT EXISTS folders (
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,                        -- INBOX / Sent / Drafts / Trash / Junk / Starred
  unread_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER,
  PRIMARY KEY (account_id, name),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- One row per stored message. Folder is part of the primary key because
-- the same Message-ID can appear in multiple folders (e.g. archived + starred).
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,                       -- uuid
  account_id TEXT NOT NULL,
  folder TEXT NOT NULL,                      -- INBOX / Sent / Drafts / Trash / Junk / Starred
  direction TEXT NOT NULL,                   -- 'inbound' / 'outbound'
  message_id TEXT,                           -- RFC 5322 Message-ID header
  in_reply_to TEXT,
  thread_id TEXT,                            -- derived from References / In-Reply-To

  from_addr TEXT,
  from_name TEXT,
  to_addrs TEXT,                             -- JSON [{addr, name}]
  cc_addrs TEXT,                             -- JSON
  bcc_addrs TEXT,                            -- JSON (outbound only)

  subject TEXT,
  preview TEXT,                              -- first ~200 chars of text
  body_html_key TEXT,                        -- R2 key for HTML body
  body_text_key TEXT,                        -- R2 key for plain text body
  has_attachments INTEGER NOT NULL DEFAULT 0,
  flags TEXT NOT NULL DEFAULT '[]',         -- JSON array, e.g. ["\\Seen","\\Flagged"]
  size INTEGER NOT NULL DEFAULT 0,          -- raw message size in bytes
  received_at INTEGER NOT NULL,             -- internal date
  created_at INTEGER NOT NULL,

  UNIQUE (account_id, folder, message_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_account_folder_date
  ON messages(account_id, folder, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_account_flags
  ON messages(account_id, folder, flags);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(account_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_messages_message_id
  ON messages(message_id);

-- Attachment metadata. The file body lives in R2 under attachments/<account>/<messageId>/<filename>.
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,                  -- messages.id (uuid) of parent
  filename TEXT,
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  content_id TEXT,                           -- for inline cid: images
  r2_key TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message
  ON attachments(message_id);

-- Invite codes for invite-only registration. The hashed form is stored;
-- the plaintext is shared out-of-band and consumed on first use.
CREATE TABLE IF NOT EXISTS invite_codes (
  code_hash TEXT PRIMARY KEY,
  local_part TEXT,                           -- pre-assigned local part (optional)
  created_by TEXT,                           -- account id of admin
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  consumed_at INTEGER,
  consumed_by TEXT,                          -- account id that used it
  notes TEXT
);
