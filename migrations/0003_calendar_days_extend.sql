-- =============================================================================
-- 0003_calendar_days_extend
-- Stage 2H: adds the fields svetikony-admin's Calendar Day form actually
-- needs (slug, language, translation_group_id, history, image_url) and
-- relaxes day_type, which never matched the admin's own taxonomy.
--
-- SQLite cannot ALTER a CHECK constraint or add a column with a CHECK in
-- one step for an existing NOT NULL column, so this rebuilds the table:
-- create church_calendar_days_new, copy the existing rows across, drop the
-- old table, rename. Standard SQLite migration pattern.
-- =============================================================================

CREATE TABLE church_calendar_days_new (
    id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    date_old_style        TEXT,
    date_new_style        TEXT,
    calendar_type         TEXT NOT NULL DEFAULT 'both'
        CHECK (calendar_type IN ('old_style', 'new_style', 'both')),
    title                 TEXT NOT NULL,
    slug                  TEXT NOT NULL DEFAULT '',
    language              TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    translation_group_id  TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    -- Deliberately no CHECK here: the Rust-mirrored values (saint/feast/
    -- fasting/memorial/gospel/quiet) never matched the admin's own
    -- taxonomy (feast/fast/memorial/liturgical/civil); the admin already
    -- enforces its enum client-side via Zod, so a DB-level union list
    -- would just be a second, drifting source of truth.
    day_type              TEXT NOT NULL DEFAULT 'saint',
    description           TEXT NOT NULL DEFAULT '',
    history               TEXT NOT NULL DEFAULT '',
    image_url             TEXT NOT NULL DEFAULT '',
    rank                  INTEGER NOT NULL DEFAULT 0,
    status                TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (date_old_style IS NOT NULL OR date_new_style IS NOT NULL),
    UNIQUE (slug, language)
);

INSERT INTO church_calendar_days_new
    (id, date_old_style, date_new_style, calendar_type, title, day_type, description, rank, status, created_at, updated_at)
SELECT
    id, date_old_style, date_new_style, calendar_type, title, day_type, description, rank, status, created_at, updated_at
FROM church_calendar_days;

DROP TABLE church_calendar_days;
ALTER TABLE church_calendar_days_new RENAME TO church_calendar_days;

CREATE INDEX IF NOT EXISTS idx_church_calendar_days_new_date ON church_calendar_days(date_new_style, rank DESC);
CREATE INDEX IF NOT EXISTS idx_church_calendar_days_old_date ON church_calendar_days(date_old_style, rank DESC);
CREATE INDEX IF NOT EXISTS idx_church_calendar_days_public_slug ON church_calendar_days(slug, language, status);

CREATE TRIGGER IF NOT EXISTS trg_church_calendar_days_updated_at
    AFTER UPDATE ON church_calendar_days
    BEGIN
        UPDATE church_calendar_days SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;
