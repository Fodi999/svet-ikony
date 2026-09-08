-- Additive only. Telegram passwordless admin login (Phase 3) -- replaces
-- PBKDF2 password login as the primary auth path (kept in source as
-- rollback/bootstrap only, see lib/d1/password.ts) after discovering
-- Cloudflare Workers' PBKDF2 iteration cap makes the 600k-iteration
-- password hash unusable in production. Telegram's numeric `from.id` is
-- the authentication factor here, never a password.

-- Explicit server-side binding of a Telegram account to an admin_users row.
-- No public self-registration: rows here are only ever created by the
-- scripts/admin-cli/admin-cli.mjs `telegram-bind` command (same
-- human-reviewed, out-of-band bootstrap convention as admin_users itself).
-- telegram_user_id is TEXT, not INTEGER -- Telegram's numeric ids can
-- exceed JS's safe integer range, and this value is never arithmetic, only
-- ever compared for equality, so there is no reason to risk a JS number
-- precision bug. UNIQUE(telegram_user_id): one Telegram account maps to at
-- most one admin_users row. revoked_at (nullable) supports "unbind without
-- losing history" -- same soft-revocation shape as admin_sessions.revoked_at.
CREATE TABLE IF NOT EXISTS admin_telegram_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id),
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_telegram_identities_telegram_user_id ON admin_telegram_identities(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_telegram_identities_user_id ON admin_telegram_identities(user_id);

-- One row per issued login ticket. ticket_hash is SHA-256(raw ticket) --
-- the raw ticket (>=256 bits of crypto.getRandomValues randomness, the
-- literal value the Telegram button URL carries in its fragment) is never
-- persisted anywhere, same principle as admin_sessions.token_hash and
-- password_hash. display_code is a separate, human-readable 6-digit code
-- for diagnostics only -- it never authenticates anything on its own (the
-- exchange endpoint only ever looks up by ticket_hash). consumed_at /
-- cancelled_at are both nullable and mutually exclusive in practice: a
-- ticket is consumed by a successful exchange, or cancelled when a newer
-- /login request supersedes it (at most one live ticket per Telegram
-- identity) -- see admin-telegram-login-requests.ts's cancelPreviousForTelegramUser.
CREATE TABLE IF NOT EXISTS admin_telegram_login_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id),
  telegram_user_id TEXT NOT NULL,
  ticket_hash TEXT NOT NULL UNIQUE,
  display_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_telegram_login_requests_ticket_hash ON admin_telegram_login_requests(ticket_hash);
CREATE INDEX IF NOT EXISTS idx_admin_telegram_login_requests_telegram_user_id ON admin_telegram_login_requests(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_telegram_login_requests_expires_at ON admin_telegram_login_requests(expires_at);
