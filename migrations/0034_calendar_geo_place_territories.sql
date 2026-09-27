-- Additive: place-to-place hierarchy (e.g. Kyiv-Pechersk Lavra CONTAINS the
-- Dormition Cathedral). This is deliberately a SEPARATE table from
-- calendar_geo_relations -- that table links an ENTITY to a PLACE (e.g.
-- "this church entity is located at this place", relation_type='pilgrimage'
-- in the 0035 seed) and must never be reused for PLACE<->PLACE containment,
-- which is a different relationship kind entirely.
CREATE TABLE calendar_geo_place_relations (
 parent_place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 child_place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 relation_type TEXT NOT NULL CHECK(relation_type IN ('contains','part_of')),
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 verification_status TEXT NOT NULL DEFAULT 'needs_review' CHECK(verification_status IN ('verified','needs_review','unknown')),
 PRIMARY KEY(parent_place_id, child_place_id, relation_type)
);

CREATE INDEX idx_calendar_geo_place_relations_child ON calendar_geo_place_relations(child_place_id);

-- Additive: territory polygons for the SacredPlacePanel pilot. place_id is
-- deliberately NOT unique -- a complex (e.g. a lavra) may end up with more
-- than one Polygon/MultiPolygon geometry over time. Visual style (fill/
-- stroke color) is intentionally NOT stored here: the Cesium layer
-- (lib/cesium/sacred-places.ts) applies one consistent style, same as the
-- existing historical-territories rendering in lib/cesium/events.ts.
CREATE TABLE calendar_geo_place_territories (
 id TEXT PRIMARY KEY,
 place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 geometry_type TEXT NOT NULL CHECK(geometry_type IN ('Polygon','MultiPolygon')),
 geometry_json TEXT NOT NULL CHECK(json_valid(geometry_json)),
 source_id TEXT NOT NULL REFERENCES calendar_geo_sources(id),
 verification_status TEXT NOT NULL DEFAULT 'needs_review' CHECK(verification_status IN ('verified','needs_review','unknown')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER calendar_geo_place_territories_updated_at
 AFTER UPDATE ON calendar_geo_place_territories
 BEGIN UPDATE calendar_geo_place_territories SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END;

CREATE INDEX idx_calendar_geo_place_territories_place ON calendar_geo_place_territories(place_id);
