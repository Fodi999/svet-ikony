-- =============================================================================
-- 0022_ai_proposals_human_creator
-- Additive/local phase: "AI Fill" ("Заповнити відсутнє з AI") on a PUBLISHED
-- calendar day must stop writing directly to the record (see
-- calendar-ai-actions.ts) and instead create the same kind of ai_proposals
-- row an AI grant's prepare_change already creates -- so the admin reviews
-- it through the existing proposal panel, not a second parallel mechanism.
--
-- 0021's created_by_ai_grant_id is NOT NULL REFERENCES ai_access_grants(id):
-- correct for an AI-authored proposal, but a human clicking a button in an
-- authenticated admin session has no AI grant at all, and must never be
-- attributed to a fabricated one. This adds created_by_admin_user_id
-- (nullable, REFERENCES admin_users(id)) as the alternate creator and
-- enforces that a proposal has EXACTLY ONE creator: AI grant XOR admin user,
-- never both, never neither.
--
-- SQLite cannot relax an existing NOT NULL/add a CHECK spanning two columns
-- via ALTER TABLE, so this rebuilds the table -- same pattern as
-- 0003_calendar_days_extend.sql / 0004_prayers_relax_enums.sql. Existing
-- rows are all AI-authored (created_by_admin_user_id was not a possibility
-- before this migration), so the copy carries created_by_ai_grant_id
-- through unchanged and leaves created_by_admin_user_id NULL for all of
-- them -- the XOR check still holds for every existing row.
-- =============================================================================

CREATE TABLE ai_proposals_new (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT NOT NULL,
 target_version TEXT NOT NULL, target_snapshot_json TEXT NOT NULL,
 language TEXT, translation_group_id TEXT,
 proposed_changes_json TEXT NOT NULL,
 created_by_ai_grant_id TEXT REFERENCES ai_access_grants(id),
 created_by_admin_user_id TEXT REFERENCES admin_users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected','stale')),
 reason TEXT NOT NULL, sources_json TEXT NOT NULL,
 created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by_admin_user_id TEXT,
 applied_at TEXT, review_nonce TEXT,
 CHECK ((created_by_ai_grant_id IS NOT NULL) + (created_by_admin_user_id IS NOT NULL) = 1)
);

INSERT INTO ai_proposals_new
    (id, environment, target_type, target_id, target_version, target_snapshot_json,
     language, translation_group_id, proposed_changes_json, created_by_ai_grant_id,
     created_by_admin_user_id, status, reason, sources_json, created_at, reviewed_at,
     reviewed_by_admin_user_id, applied_at, review_nonce)
SELECT
    id, environment, target_type, target_id, target_version, target_snapshot_json,
    language, translation_group_id, proposed_changes_json, created_by_ai_grant_id,
    NULL, status, reason, sources_json, created_at, reviewed_at,
    reviewed_by_admin_user_id, applied_at, review_nonce
FROM ai_proposals;

DROP TABLE ai_proposals;
ALTER TABLE ai_proposals_new RENAME TO ai_proposals;

CREATE INDEX ai_proposals_target ON ai_proposals(environment,target_type,target_id,status);
CREATE INDEX ai_proposals_owner ON ai_proposals(created_by_ai_grant_id,created_at);
CREATE INDEX ai_proposals_admin_owner ON ai_proposals(created_by_admin_user_id,created_at);
