-- Additive only. Legacy image_url and CMS/geo links are not backfilled or changed.
CREATE TABLE globe_marker_image_owners (
 id TEXT PRIMARY KEY,
 saint_group_id TEXT UNIQUE,
 place_id TEXT UNIQUE REFERENCES calendar_geo_places(id),
 CHECK ((saint_group_id IS NULL) != (place_id IS NULL))
);
CREATE TRIGGER globe_marker_owner_saint_exists BEFORE INSERT ON globe_marker_image_owners
 WHEN NEW.saint_group_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM church_saints WHERE translation_group_id = NEW.saint_group_id)
 BEGIN SELECT RAISE(ABORT, 'Unknown saint translation group'); END;
CREATE TRIGGER globe_marker_owner_immutable BEFORE UPDATE ON globe_marker_image_owners
 BEGIN SELECT RAISE(ABORT, 'Marker image owner is immutable'); END;

-- Stable object keys, never expiring URLs. Each upload/derivative gets a fresh key.
CREATE TABLE globe_marker_image_assets (
 object_key TEXT PRIMARY KEY CHECK(length(trim(object_key)) > 0 AND instr(object_key, '://') = 0 AND instr(object_key, '?') = 0),
 role TEXT NOT NULL CHECK(role IN ('original','marker','panel')),
 width INTEGER NOT NULL CHECK(width > 0),
 height INTEGER NOT NULL CHECK(height > 0),
 CHECK(role != 'marker' OR (width = 256 AND height = 256))
);
CREATE TRIGGER globe_marker_asset_immutable BEFORE UPDATE ON globe_marker_image_assets
 BEGIN SELECT RAISE(ABORT, 'Image assets are immutable'); END;

CREATE TABLE globe_marker_image_versions (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES globe_marker_image_owners(id),
 original_key TEXT NOT NULL REFERENCES globe_marker_image_assets(object_key),
 marker_key TEXT NOT NULL REFERENCES globe_marker_image_assets(object_key),
 panel_key TEXT NOT NULL REFERENCES globe_marker_image_assets(object_key),
 crop_x REAL NOT NULL DEFAULT 0 CHECK(crop_x >= 0 AND crop_x < 1),
 crop_y REAL NOT NULL DEFAULT 0 CHECK(crop_y >= 0 AND crop_y < 1),
 crop_width REAL NOT NULL DEFAULT 1 CHECK(crop_width > 0 AND crop_width <= 1),
 crop_height REAL NOT NULL DEFAULT 1 CHECK(crop_height > 0 AND crop_height <= 1),
 identity_verified INTEGER NOT NULL DEFAULT 0 CHECK(identity_verified IN (0,1)),
 verified_original_key TEXT,
 rights_verified INTEGER NOT NULL DEFAULT 0 CHECK(rights_verified IN (0,1)),
 source_url TEXT,
 author TEXT,
 rights_statement TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(owner_id,id),
 CHECK(crop_x + crop_width <= 1 AND crop_y + crop_height <= 1),
 CHECK((identity_verified = 0 AND verified_original_key IS NULL) OR
       (identity_verified = 1 AND verified_original_key IS NOT NULL AND verified_original_key = original_key)),
 CHECK(rights_verified = 0 OR (length(trim(coalesce(rights_statement,''))) > 0))
);
CREATE TRIGGER globe_marker_version_roles BEFORE INSERT ON globe_marker_image_versions
 WHEN NOT EXISTS(SELECT 1 FROM globe_marker_image_assets WHERE object_key=NEW.original_key AND role='original')
 OR NOT EXISTS(SELECT 1 FROM globe_marker_image_assets WHERE object_key=NEW.marker_key AND role='marker')
 OR NOT EXISTS(SELECT 1 FROM globe_marker_image_assets WHERE object_key=NEW.panel_key AND role='panel')
 BEGIN SELECT RAISE(ABORT, 'Invalid image variant roles'); END;
-- Reuse a derivative only for the exact same owner, original and crop (e.g. review).
CREATE TRIGGER globe_marker_version_derivatives BEFORE INSERT ON globe_marker_image_versions
 WHEN EXISTS(SELECT 1 FROM globe_marker_image_versions v
 WHERE (v.marker_key=NEW.marker_key OR v.panel_key=NEW.panel_key)
 AND (v.owner_id!=NEW.owner_id OR v.original_key!=NEW.original_key OR
 v.crop_x!=NEW.crop_x OR v.crop_y!=NEW.crop_y OR v.crop_width!=NEW.crop_width OR v.crop_height!=NEW.crop_height))
 BEGIN SELECT RAISE(ABORT, 'New crop/original requires new derivative keys'); END;
CREATE TRIGGER globe_marker_version_immutable BEFORE UPDATE ON globe_marker_image_versions
 BEGIN SELECT RAISE(ABORT, 'Create a new image version'); END;

CREATE TABLE globe_marker_image_state (
 owner_id TEXT PRIMARY KEY REFERENCES globe_marker_image_owners(id),
 draft_version_id TEXT,
 published_version_id TEXT,
 FOREIGN KEY(owner_id,draft_version_id) REFERENCES globe_marker_image_versions(owner_id,id),
 FOREIGN KEY(owner_id,published_version_id) REFERENCES globe_marker_image_versions(owner_id,id)
);
-- NULL published_version_id explicitly withdraws the image; draft stays available.
-- No fallback to draft, legacy image_url or another object's image.
CREATE VIEW globe_marker_published_images AS
 SELECT o.id AS owner_id,o.saint_group_id,o.place_id,v.id AS version_id,
 v.original_key,v.marker_key,v.panel_key,v.source_url,v.author,v.rights_statement
 FROM globe_marker_image_state s
 JOIN globe_marker_image_owners o ON o.id=s.owner_id
 JOIN globe_marker_image_versions v ON v.id=s.published_version_id AND v.owner_id=s.owner_id
 WHERE v.identity_verified=1 AND v.rights_verified=1;
