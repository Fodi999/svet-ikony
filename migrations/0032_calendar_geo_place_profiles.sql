-- Additive: rich profile fields for the Sacred Place panel (GlobeShell
-- pilot, Kyiv-Pechersk Lavra scope). Absence of a calendar_geo_place_profiles
-- row for a given place means "no curated profile yet" (hasProfile=false),
-- not an error -- every reader must treat a missing row as an empty state.
--
-- Text fields are row-based per locale (calendar_geo_place_profile_translations),
-- matching the localization style already used across calendar_geo_* (see
-- calendar_geo_translations) instead of one column per locale.
CREATE TABLE calendar_geo_place_profiles (
 place_id TEXT PRIMARY KEY REFERENCES calendar_geo_places(id),
 website_url TEXT,
 map_url TEXT,
 opening_hours_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(opening_hours_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER calendar_geo_place_profiles_updated_at
 AFTER UPDATE ON calendar_geo_place_profiles
 BEGIN UPDATE calendar_geo_place_profiles SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE place_id=NEW.place_id; END;

CREATE TABLE calendar_geo_place_profile_translations (
 place_id TEXT NOT NULL REFERENCES calendar_geo_place_profiles(place_id),
 locale TEXT NOT NULL CHECK(locale IN ('uk','ru','en')),
 history_text TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',
 directions TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(place_id, locale)
);

-- The Sacred Place pilot needs to list markers by viewport (GET
-- /api/calendar/places?bbox=...), and calendar_geo_places has never had a
-- spatial index -- every existing read (calendarGeoDay/calendarGeoCatalog/
-- calendarGeoEntity) filters by entity/date, never by lat/lon range.
CREATE INDEX idx_calendar_geo_places_lat_lon ON calendar_geo_places(lat, lon);
