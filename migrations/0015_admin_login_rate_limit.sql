-- Additive only. Login brute-force protection (Phase 1D.2) -- the backend
-- credential verifier (this app, not svetikony-admin's BFF) is the
-- authoritative enforcement point, since it is the only place that ever
-- actually checks a password. See the Phase 1D.2 design report for the
-- full concurrency/key-model reasoning.
--
-- One row per rate-limit key. `key_hash` is SHA-256(trim+lowercase(email))
-- hex-encoded -- never the raw email -- so a dump of this table cannot be
-- used to enumerate which admin email addresses have been targeted, and
-- matches lib/d1/session-token.ts's existing hashSessionToken() pattern.
--
-- `failed_count`/`window_started_at` track a fixed window of failures;
-- `blocked_until`, once set, freezes `failed_count` (no further increment)
-- until it elapses, at which point the very next attempt starts a fresh
-- window. All three fields are written by exactly one atomic
-- `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement per failed
-- attempt (lib/d1/repositories/admin-login-rate-limit.ts's
-- recordFailedAttempt) -- never a separate SELECT-then-INSERT/UPDATE pair,
-- which would let concurrent failing requests race past the limit.
--
-- No dedicated cleanup job: a handful of admin accounts does not justify a
-- cron. Instead, every login POST also opportunistically deletes rows
-- whose `updated_at` is older than the retention window (see
-- cleanupExpiredRateLimit), which is always safely past any real
-- `blocked_until` value a still-relevant row could hold.
CREATE TABLE IF NOT EXISTS admin_login_rate_limit (
  key_hash TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_login_rate_limit_updated_at ON admin_login_rate_limit(updated_at);
