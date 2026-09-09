-- "Візуалізатор" -- admin-curated historical/biblical events with flexible
-- (era/century/year/BC-AD/traditional) chronology and optional geo
-- coordinates, each optionally carrying an admin-uploaded GLB 3D model.
-- Two new tables, additive only (no existing table touched).
--
-- visualizer_events is row-per-language (language, translation_group_id),
-- the same shape as church_saints/church_prayers/church_alphabet_letters --
-- see lib/d1/repositories/alphabet.ts for the COALESCE-by-slug auto-join
-- pattern the repository layer reuses here.
--
-- visualizer_models.event_group_id intentionally has NO SQL FOREIGN KEY.
-- It references visualizer_events.translation_group_id, which is shared by
-- (typically 3) sibling rows -- SQLite requires an FK target to be a
-- PRIMARY KEY or UNIQUE column, and translation_group_id is deliberately
-- NOT unique. A model belongs to the whole translation group (one GLB
-- shown regardless of viewer language), not to one specific language row.
-- Existence is validated in the repository layer instead of the schema.

CREATE TABLE IF NOT EXISTS visualizer_events (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    slug                TEXT NOT NULL,
    language            TEXT NOT NULL DEFAULT 'uk',
    translation_group_id TEXT NOT NULL,
    title               TEXT NOT NULL,
    summary             TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    event_type          TEXT NOT NULL DEFAULT 'other'
        CHECK (event_type IN ('biblical', 'church_history', 'historical', 'saint', 'council', 'location', 'other')),
    chronology_type     TEXT NOT NULL DEFAULT 'unknown'
        CHECK (chronology_type IN ('exact', 'approximate', 'traditional', 'period', 'unknown')),
    era                 TEXT NOT NULL DEFAULT 'custom'
        CHECK (era IN ('biblical_creation', 'biblical_old_testament', 'biblical_new_testament', 'apostolic', 'early_church', 'byzantine', 'medieval', 'modern', 'contemporary', 'custom')),
    calendar_era        TEXT NOT NULL DEFAULT 'unknown'
        CHECK (calendar_era IN ('BC', 'AD', 'unknown')),
    year_start          INTEGER,
    year_end            INTEGER,
    century             INTEGER,
    display_date        TEXT NOT NULL DEFAULT '',
    -- Machine sort key, always populated (even for fuzzy/traditional dates
    -- with no exact year) so ORDER BY sort_year is never NULL-ambiguous --
    -- computed server-side by the repository, see visualizerEvents.ts.
    sort_year           INTEGER NOT NULL DEFAULT 0,
    location_name       TEXT NOT NULL DEFAULT '',
    latitude            REAL,
    longitude           REAL,
    calendar_day_id     TEXT REFERENCES church_calendar_days(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    is_featured         INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    published_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_visualizer_events_status ON visualizer_events(status);
CREATE INDEX IF NOT EXISTS idx_visualizer_events_sort_year ON visualizer_events(sort_year);
CREATE INDEX IF NOT EXISTS idx_visualizer_events_slug ON visualizer_events(slug);
CREATE INDEX IF NOT EXISTS idx_visualizer_events_translation_group_id ON visualizer_events(translation_group_id);
CREATE INDEX IF NOT EXISTS idx_visualizer_events_calendar_day_id ON visualizer_events(calendar_day_id);

CREATE TRIGGER IF NOT EXISTS trg_visualizer_events_updated_at
    AFTER UPDATE ON visualizer_events
    BEGIN
        UPDATE visualizer_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

CREATE TABLE IF NOT EXISTS visualizer_models (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    event_group_id  TEXT,
    title           TEXT NOT NULL DEFAULT '',
    r2_key          TEXT NOT NULL,
    filename        TEXT NOT NULL DEFAULT '',
    mime_type       TEXT NOT NULL DEFAULT '',
    file_size       INTEGER NOT NULL DEFAULT 0,
    is_base_earth   INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_visualizer_models_event_group_id ON visualizer_models(event_group_id);

-- Enforces "only one active Base Earth Model at a time" at the DB level --
-- a partial unique index only constrains rows where is_base_earth = 1, so
-- any number of non-base-earth rows coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_visualizer_models_one_base_earth ON visualizer_models(is_base_earth) WHERE is_base_earth = 1;

CREATE TRIGGER IF NOT EXISTS trg_visualizer_models_updated_at
    AFTER UPDATE ON visualizer_models
    BEGIN
        UPDATE visualizer_models SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;
