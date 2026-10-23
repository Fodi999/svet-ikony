-- Additive: richer real-place fields for calendar_geo_places and per-place
-- Cesium 3D model settings. Nothing is renamed or rewritten, so every
-- existing place (NULL city/district/altitude, no model row) keeps working
-- exactly as before; the globe falls back to its 2D pin when a place has no
-- published model.
--
-- Place and saint stay separate entities: a saint (calendar_geo_entities,
-- linked to church_saints via calendar_geo_content_links) reaches any number
-- of places through the existing many-to-many calendar_geo_relations table.
-- This migration adds no second saint<->place link.
ALTER TABLE calendar_geo_places ADD COLUMN city TEXT;
ALTER TABLE calendar_geo_places ADD COLUMN district TEXT;
-- Metres above the WGS84 ellipsoid (what Cesium positions use). NULL = clamp
-- the marker/model to the terrain surface.
ALTER TABLE calendar_geo_places ADD COLUMN altitude REAL CHECK(altitude IS NULL OR altitude BETWEEN -500 AND 9000);

-- Public visibility of a sacred place on the globe, independent of its data:
-- 0 hides the place from the public globe/panel while its profile, addresses,
-- history, saint links, territory and 3D model all stay in place. Existing
-- profiles default to visible, so nothing currently shown disappears.
ALTER TABLE calendar_geo_place_profiles ADD COLUMN public_visible INTEGER NOT NULL DEFAULT 1 CHECK(public_visible IN (0,1));

CREATE TABLE calendar_geo_place_models (
 place_id TEXT PRIMARY KEY REFERENCES calendar_geo_places(id),
 -- An R2 media key (media/...glb) or a site-relative path (/markers/...glb).
 -- Never an absolute URL: the site serves every model from its own origin.
 model_url TEXT NOT NULL CHECK(length(trim(model_url)) > 0 AND instr(model_url, '://') = 0 AND lower(model_url) LIKE '%.glb'),
 scale REAL NOT NULL DEFAULT 1 CHECK(scale > 0 AND scale <= 1000),
 heading REAL NOT NULL DEFAULT 0 CHECK(heading BETWEEN -360 AND 360),
 pitch REAL NOT NULL DEFAULT 0 CHECK(pitch BETWEEN -180 AND 180),
 roll REAL NOT NULL DEFAULT 0 CHECK(roll BETWEEN -180 AND 180),
 height_offset REAL NOT NULL DEFAULT 0 CHECK(height_offset BETWEEN -1000 AND 1000),
 -- Only 'published' rows reach the public globe; 'draft' is admin preview.
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER calendar_geo_place_models_updated_at
 AFTER UPDATE ON calendar_geo_place_models
 BEGIN UPDATE calendar_geo_place_models SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE place_id=NEW.place_id; END;
