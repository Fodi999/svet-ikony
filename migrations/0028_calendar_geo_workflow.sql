CREATE TABLE calendar_geo_stages (
 profile_id TEXT NOT NULL REFERENCES calendar_geo_profiles(id),
 stage TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','running','complete','retry','not_applicable','error')),
 detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(profile_id,stage)
);
CREATE TABLE calendar_geo_metrics (name TEXT PRIMARY KEY,value INTEGER NOT NULL DEFAULT 0);
ALTER TABLE calendar_geo_entities ADD COLUMN geo_status TEXT NOT NULL DEFAULT 'unknown'
 CHECK(geo_status IN ('machine_high','needs_review','reviewed_verified','reviewed_rejected','unknown','manual_unverified'));
ALTER TABLE calendar_geo_places ADD COLUMN geo_status TEXT NOT NULL DEFAULT 'unknown'
 CHECK(geo_status IN ('machine_high','needs_review','reviewed_verified','reviewed_rejected','unknown','manual_unverified'));
ALTER TABLE calendar_geo_relations ADD COLUMN geo_status TEXT NOT NULL DEFAULT 'unknown'
 CHECK(geo_status IN ('machine_high','needs_review','reviewed_verified','reviewed_rejected','unknown','manual_unverified'));
UPDATE calendar_geo_places SET geo_status='machine_high' WHERE lat IS NOT NULL AND match_status='machine_high';
UPDATE calendar_geo_relations SET geo_status='machine_high' WHERE match_status='machine_high';
UPDATE calendar_geo_entities SET geo_status='machine_high' WHERE EXISTS(SELECT 1 FROM calendar_geo_relations r JOIN calendar_geo_places p ON p.id=r.place_id WHERE r.entity_id=calendar_geo_entities.id AND p.lat IS NOT NULL);
CREATE TABLE calendar_geo_entity_redirects (
 old_id TEXT PRIMARY KEY REFERENCES calendar_geo_entities(id),
 canonical_id TEXT NOT NULL REFERENCES calendar_geo_entities(id),
 reviewed_at TEXT NOT NULL,reviewed_by TEXT NOT NULL,CHECK(old_id!=canonical_id)
);
