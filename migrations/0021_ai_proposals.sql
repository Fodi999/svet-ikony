CREATE TABLE ai_proposals (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT NOT NULL,
 target_version TEXT NOT NULL, target_snapshot_json TEXT NOT NULL,
 language TEXT, translation_group_id TEXT,
 proposed_changes_json TEXT NOT NULL, created_by_ai_grant_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected','stale')),
 reason TEXT NOT NULL, sources_json TEXT NOT NULL,
 created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by_admin_user_id TEXT,
 applied_at TEXT, review_nonce TEXT,
 FOREIGN KEY(created_by_ai_grant_id) REFERENCES ai_access_grants(id)
);
CREATE INDEX ai_proposals_target ON ai_proposals(environment,target_type,target_id,status);
CREATE INDEX ai_proposals_owner ON ai_proposals(created_by_ai_grant_id,created_at);
CREATE TABLE ai_proposal_audit (
 id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES ai_proposals(id),
 actor_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL
);
