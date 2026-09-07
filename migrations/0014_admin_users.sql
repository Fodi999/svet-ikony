-- Additive only. Real per-user admin authentication foundation (Phase 1A) --
-- replaces svetikony-admin's Stage-1 client-side mock login + shared Basic
-- Auth gate with real credentials, real server-side sessions, and a real
-- audit trail. See the Phase 1A design report for the full trust-boundary
-- reasoning; short version: these three tables live here (not in
-- svetikony-admin, which owns no database) because svet-ikony is the sole
-- source of truth for all real data in this system, and the existing
-- requireSuperAdmin() service-credential check (lib/d1/auth.ts) already
-- protects every /api/admin/** route this data will be read/written through
-- -- these tables get no new, weaker entry point.

-- Real people who can operate the admin panel. `role` is exactly
-- svetikony-admin's existing lib/auth/permissions.ts Role union -- no
-- invented roles. `password_hash` is always the versioned, self-describing
-- format produced by lib/d1/password.ts (pbkdf2-sha256$<iterations>$<salt>$<hash>),
-- never a raw or unversioned hash.
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'editor', 'order_manager', 'viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

-- One row per issued session. `token_hash` is SHA-256(raw opaque token) --
-- the raw token (the literal X-Admin-Session value) is never persisted
-- anywhere, mirroring how password_hash never stores the raw password.
-- Revocation is a real UPDATE (revoked_at), not just letting a stateless
-- token expire -- this is what makes "logout invalidates the session" and
-- "disabled account rejected immediately" actually true rather than
-- aspirational.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);

-- Structured, append-only record of admin actions. Deliberately NO foreign
-- key on user_id (unlike admin_sessions) -- audit history must remain
-- readable even if a user account is later removed, so it must not be
-- coupled to that row's lifetime. Phase 1A wrote only login/session/logout
-- events here; Phase 1D.1 adds the ~71 withAuth()-protected BFF mutation
-- events (POST/PUT/PATCH/DELETE only -- GETs and denied 401/403 requests
-- are never audited here, see the Phase 1D.1 report). Never store:
-- password, password_hash, raw session token, token hash, service
-- credential, secrets, header values, or request bodies -- only these
-- structured fields.
--
-- user_id/role are nullable specifically for a failed login against an
-- email that matches no real account: that event is still worth recording
-- (failed-login volume is a real security signal) but there is no real
-- actor to attribute it to, and the attempted email itself is not stored
-- anywhere in this table to avoid recording arbitrary user-supplied PII.
--
-- status_code/request_id added in the same migration (0014 was confirmed,
-- before this addition, to have never been applied to any shared
-- environment -- local dev D1 tops out at 0012, production D1 tops out at
-- 0013 -- so extending it in place is safe; this is not a rewrite of
-- applied history). status_code is the real HTTP status the mutating
-- handler actually returned (never assumed from `success` alone).
-- request_id is a per-mutation crypto.randomUUID(), minted once in
-- svetikony-admin's withAuth() and threaded through to this row, so a
-- single id can correlate the BFF mutation, the resource's own upstream
-- call, this audit row, and any server-side error log for the same action.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  action TEXT NOT NULL,
  area TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  status_code INTEGER,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_id ON admin_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_request_id ON admin_audit_log(request_id);
