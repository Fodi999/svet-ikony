ALTER TABLE calendar_geo_entities ADD COLUMN match_status TEXT NOT NULL DEFAULT 'needs_review'
 CHECK(match_status IN ('machine_high','reviewed_verified','reviewed_rejected','needs_review','not_found'));
ALTER TABLE calendar_geo_entities ADD COLUMN identity_profile TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(identity_profile));
ALTER TABLE calendar_geo_places ADD COLUMN match_status TEXT NOT NULL DEFAULT 'needs_review'
 CHECK(match_status IN ('machine_high','reviewed_verified','reviewed_rejected','needs_review','not_found'));
ALTER TABLE calendar_geo_relations ADD COLUMN match_status TEXT NOT NULL DEFAULT 'needs_review'
 CHECK(match_status IN ('machine_high','reviewed_verified','reviewed_rejected','needs_review','not_found'));

-- Unresolved source records are profiles, not asserted unique people.
CREATE TABLE calendar_geo_profiles (
 id TEXT PRIMARY KEY,
 entity_id TEXT REFERENCES calendar_geo_entities(id),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
 match_status TEXT NOT NULL DEFAULT 'needs_review'
  CHECK(match_status IN ('machine_high','reviewed_verified','reviewed_rejected','needs_review','not_found')),
 enrichment_status TEXT NOT NULL DEFAULT 'pending' CHECK(enrichment_status IN ('pending','complete','retry')),
 error TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE calendar_geo_rule_profiles (
 rule_id TEXT NOT NULL REFERENCES calendar_geo_rules(id),
 profile_id TEXT NOT NULL REFERENCES calendar_geo_profiles(id),
 PRIMARY KEY(rule_id,profile_id)
);
CREATE TABLE calendar_geo_profile_candidates (
 profile_id TEXT NOT NULL REFERENCES calendar_geo_profiles(id),
 qid TEXT NOT NULL,
 confidence TEXT NOT NULL CHECK(confidence IN ('HIGH','MEDIUM','LOW')),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 status TEXT NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','confirmed','rejected')),
 PRIMARY KEY(profile_id,qid)
);
CREATE TABLE calendar_geo_http_cache (
 cache_key TEXT PRIMARY KEY,
 url TEXT NOT NULL,
 retrieved_at TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE TABLE calendar_geo_images (
 id TEXT PRIMARY KEY,
 entity_id TEXT REFERENCES calendar_geo_entities(id),
 place_id TEXT REFERENCES calendar_geo_places(id),
 commons_page TEXT NOT NULL,
 image_url TEXT,
 author TEXT,
 license TEXT,
 license_url TEXT,
 attribution TEXT,
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 status TEXT NOT NULL CHECK(status IN ('usable','needs_review','rejected')),
 CHECK((entity_id IS NULL) != (place_id IS NULL))
);
CREATE TABLE calendar_geo_review_log (
 id TEXT PRIMARY KEY,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL,
 action TEXT NOT NULL,
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),
 after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 reviewed_by TEXT NOT NULL,
 reviewed_at TEXT NOT NULL
);
