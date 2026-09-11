-- Additive delegated access. No plaintext credentials.
CREATE TABLE ai_access_grants (
 id TEXT PRIMARY KEY, admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
 environment TEXT NOT NULL CHECK(environment IN ('local','production')), mode TEXT NOT NULL CHECK(mode IN ('READ_ONLY','DRAFT_EDIT')),
 scopes_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
);
CREATE TABLE ai_pairing_codes (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES ai_access_grants(id), code_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL, exchange_id TEXT
);
CREATE TABLE ai_access_tokens (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES ai_access_grants(id), token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
);
CREATE TABLE ai_activity_log (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES ai_access_grants(id), admin_user_id TEXT NOT NULL,
 tool_name TEXT NOT NULL, module TEXT NOT NULL, operation TEXT NOT NULL, target_type TEXT, target_id TEXT,
 request_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX ai_grants_owner ON ai_access_grants(admin_user_id,created_at);
CREATE INDEX ai_activity_grant ON ai_activity_log(grant_id,created_at);
CREATE TABLE ai_exchange_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL);
