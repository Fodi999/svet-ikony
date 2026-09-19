-- Additive calendar geography. Existing editorial records remain authoritative.
CREATE TABLE calendar_geo_entities (
 id TEXT PRIMARY KEY,
 entity_type TEXT NOT NULL CHECK(entity_type IN ('saint','feast','icon','church_event','historical_event','relic','church','monastery','shrine')),
 canonical_name TEXT NOT NULL,
 wikidata_id TEXT UNIQUE,
 verification_status TEXT NOT NULL DEFAULT 'needs_review' CHECK(verification_status IN ('verified','needs_review','unknown')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE calendar_geo_content_links (
 entity_id TEXT NOT NULL REFERENCES calendar_geo_entities(id),
 content_type TEXT NOT NULL CHECK(content_type IN ('saint','prayer','icon','article','gospel','event')),
 translation_group_id TEXT NOT NULL,
 PRIMARY KEY(entity_id,content_type,translation_group_id)
);
CREATE TABLE calendar_geo_sources (
 id TEXT PRIMARY KEY,
 source_type TEXT NOT NULL CHECK(source_type IN ('internal','church_source','wikidata','wikipedia','wikimedia_commons','manual')),
 source_url TEXT NOT NULL,
 external_id TEXT,
 retrieved_at TEXT NOT NULL,
 license TEXT,
 attribution TEXT
);
CREATE TABLE calendar_geo_rules (
 id TEXT PRIMARY KEY,
 entity_id TEXT REFERENCES calendar_geo_entities(id),
 source_title TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 rule_type TEXT NOT NULL CHECK(rule_type IN ('fixed','movable','specific')),
 month INTEGER,
 day INTEGER,
 anchor TEXT,
 offset_days INTEGER,
 specific_date TEXT,
 calendar_system TEXT NOT NULL CHECK(calendar_system IN ('julian','gregorian')),
 tradition TEXT NOT NULL DEFAULT 'orthodox',
 jurisdiction TEXT NOT NULL DEFAULT '',
 verification_status TEXT NOT NULL DEFAULT 'needs_review' CHECK(verification_status IN ('verified','needs_review','unknown')),
 CHECK((rule_type='fixed' AND month IS NOT NULL AND day IS NOT NULL AND month BETWEEN 1 AND 12 AND day BETWEEN 1 AND 31 AND anchor IS NULL AND specific_date IS NULL)
 OR (rule_type='movable' AND anchor='orthodox_pascha' AND offset_days IS NOT NULL AND month IS NULL AND day IS NULL AND specific_date IS NULL)
 OR (rule_type='specific' AND specific_date IS NOT NULL AND month IS NULL AND day IS NULL AND anchor IS NULL))
);
CREATE TABLE calendar_geo_days (
 civil_date TEXT NOT NULL,
 calendar_system TEXT NOT NULL CHECK(calendar_system IN ('julian','gregorian')),
 tradition TEXT NOT NULL,
 jurisdiction TEXT NOT NULL DEFAULT '',
 resolved_at TEXT NOT NULL,
 PRIMARY KEY(civil_date,calendar_system,tradition,jurisdiction)
);
CREATE TABLE calendar_geo_occurrences (
 rule_id TEXT NOT NULL REFERENCES calendar_geo_rules(id),
 civil_date TEXT NOT NULL,
 calendar_system TEXT NOT NULL,
 tradition TEXT NOT NULL,
 jurisdiction TEXT NOT NULL DEFAULT '',
 calendar_day_id TEXT REFERENCES church_calendar_days(id),
 PRIMARY KEY(rule_id,civil_date,calendar_system,tradition,jurisdiction),
 FOREIGN KEY(civil_date,calendar_system,tradition,jurisdiction) REFERENCES calendar_geo_days(civil_date,calendar_system,tradition,jurisdiction)
);
CREATE INDEX calendar_geo_occurrences_day ON calendar_geo_occurrences(civil_date,calendar_system,tradition,jurisdiction);
CREATE TABLE calendar_geo_places (
 id TEXT PRIMARY KEY,
 canonical_name TEXT NOT NULL,
 historical_name TEXT,
 modern_name TEXT,
 lat REAL,
 lon REAL,
 country_code TEXT,
 region TEXT,
 place_type TEXT NOT NULL CHECK(place_type IN ('city','village','church','monastery','shrine','birthplace','martyrdom_place','burial_place','relic_location','historical_region','pilgrimage_place','other')),
 wikidata_id TEXT UNIQUE,
 verification_status TEXT NOT NULL DEFAULT 'needs_review' CHECK(verification_status IN ('verified','needs_review','unknown')),
 CHECK((lat IS NULL AND lon IS NULL) OR (lat IS NOT NULL AND lon IS NOT NULL AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180))
);
CREATE TABLE calendar_geo_relations (
 entity_id TEXT NOT NULL REFERENCES calendar_geo_entities(id),
 place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 relation_type TEXT NOT NULL CHECK(relation_type IN ('birth','ministry','residence','martyrdom','death','burial','relics','founded','council','icon_origin','veneration','pilgrimage','other')),
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 verification_status TEXT NOT NULL DEFAULT 'needs_review' CHECK(verification_status IN ('verified','needs_review','unknown')),
 PRIMARY KEY(entity_id,place_id,relation_type)
);
CREATE TABLE calendar_geo_translations (
 id TEXT PRIMARY KEY,
 entity_id TEXT REFERENCES calendar_geo_entities(id),
 place_id TEXT REFERENCES calendar_geo_places(id),
 locale TEXT NOT NULL,
 name TEXT NOT NULL,
 short_description TEXT NOT NULL DEFAULT '',
 wikipedia_url TEXT,
 image_caption TEXT,
 translation_status TEXT NOT NULL CHECK(translation_status IN ('verified','source','fallback','needs_review')),
 source_locale TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 CHECK((entity_id IS NOT NULL AND place_id IS NULL) OR (entity_id IS NULL AND place_id IS NOT NULL)),
 UNIQUE(entity_id,locale), UNIQUE(place_id,locale)
);
CREATE TABLE calendar_geo_provenance (
 id TEXT PRIMARY KEY,
 entity_id TEXT REFERENCES calendar_geo_entities(id),
 place_id TEXT REFERENCES calendar_geo_places(id),
 field_name TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 CHECK((entity_id IS NOT NULL AND place_id IS NULL) OR (entity_id IS NULL AND place_id IS NOT NULL))
);
CREATE TABLE calendar_geo_candidates (
 entity_id TEXT NOT NULL REFERENCES calendar_geo_entities(id),
 qid TEXT NOT NULL,
 confidence TEXT NOT NULL CHECK(confidence IN ('HIGH','MEDIUM','LOW')),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 status TEXT NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','confirmed','rejected')),
 reviewed_at TEXT,
 reviewed_by TEXT,
 PRIMARY KEY(entity_id,qid)
);
CREATE TABLE calendar_geo_import_jobs (
 id TEXT PRIMARY KEY,
 source_hash TEXT NOT NULL,
 checkpoint TEXT,
 status TEXT NOT NULL CHECK(status IN ('running','complete','failed')),
 updated_at TEXT NOT NULL,
 error TEXT
);
