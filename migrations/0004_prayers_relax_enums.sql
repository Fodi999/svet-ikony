-- =============================================================================
-- 0004_prayers_relax_enums
-- Stage 2I: svetikony-admin's Prayer form uses its own taxonomy for
-- prayerType (morning/evening/before_meal/after_meal/to_saint/to_icon/
-- feast/general) and particleColorMode (single/gradient/theme) — neither
-- overlaps at all with the Rust-mirrored values this table's CHECK
-- constraints were built from (prayer/akathist/troparion/kontakion/
-- velichanie/modern, and silver_gold/gold/silver/warm_white respectively).
-- Writing a real admin-created prayer would violate both CHECKs outright.
--
-- Same call as Stage 2H's church_calendar_days.day_type: the admin already
-- enforces its own enum client-side via Zod, so a DB-level union list here
-- would just be a second, drifting source of truth. Relax both columns to
-- plain TEXT.
--
-- SQLite cannot ALTER a CHECK constraint, so this rebuilds the table:
-- create church_prayers_new, copy existing rows, drop the old table,
-- rename. Same pattern as 0003_calendar_days_extend.sql.
-- =============================================================================

CREATE TABLE church_prayers_new (
    id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    icon_id                 TEXT REFERENCES church_icons(id) ON DELETE SET NULL,
    calendar_day_id         TEXT REFERENCES church_calendar_days(id) ON DELETE SET NULL,
    slug                    TEXT NOT NULL,
    title                   TEXT NOT NULL,
    text                    TEXT NOT NULL DEFAULT '',
    audio_url               TEXT NOT NULL DEFAULT '',
    qr_code_url             TEXT NOT NULL DEFAULT '',
    image_url               TEXT NOT NULL DEFAULT '',
    source                  TEXT NOT NULL DEFAULT '',
    source_url              TEXT NOT NULL DEFAULT '',
    note                    TEXT NOT NULL DEFAULT '',
    language                TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    -- Deliberately no CHECK here (was: prayer/akathist/troparion/kontakion/velichanie/modern) — see header.
    prayer_type             TEXT NOT NULL DEFAULT 'prayer',
    status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    translation_group_id    TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    visualizer_enabled       INTEGER NOT NULL DEFAULT 0,
    visualizer_image_url     TEXT NOT NULL DEFAULT '',
    particle_count_desktop   INTEGER NOT NULL DEFAULT 50000,
    particle_count_mobile    INTEGER NOT NULL DEFAULT 16000,
    particle_size            REAL NOT NULL DEFAULT 2.0,
    -- Deliberately no CHECK here (was: silver_gold/gold/silver/warm_white) — see header.
    particle_color_mode      TEXT NOT NULL DEFAULT 'silver_gold',
    background_color         TEXT NOT NULL DEFAULT '#000000',
    audio_reactivity         REAL NOT NULL DEFAULT 0.5,
    scene_timeline            TEXT NOT NULL DEFAULT '{"idle":2000,"assemble":2500,"reveal":1500,"dissolve":2000}',
    subtitle_cues             TEXT NOT NULL DEFAULT '[]',
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

INSERT INTO church_prayers_new
    (id, icon_id, calendar_day_id, slug, title, text, audio_url, qr_code_url, image_url, source, source_url, note,
     language, prayer_type, status, translation_group_id, visualizer_enabled, visualizer_image_url,
     particle_count_desktop, particle_count_mobile, particle_size, particle_color_mode, background_color,
     audio_reactivity, scene_timeline, subtitle_cues, created_at, updated_at)
SELECT
    id, icon_id, calendar_day_id, slug, title, text, audio_url, qr_code_url, image_url, source, source_url, note,
    language, prayer_type, status, translation_group_id, visualizer_enabled, visualizer_image_url,
    particle_count_desktop, particle_count_mobile, particle_size, particle_color_mode, background_color,
    audio_reactivity, scene_timeline, subtitle_cues, created_at, updated_at
FROM church_prayers;

DROP TABLE church_prayers;
ALTER TABLE church_prayers_new RENAME TO church_prayers;

CREATE INDEX IF NOT EXISTS idx_church_prayers_calendar_day ON church_prayers(calendar_day_id, prayer_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_prayers_icon ON church_prayers(icon_id, prayer_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_prayers_public_slug ON church_prayers(slug, status);
CREATE INDEX IF NOT EXISTS idx_church_prayers_translation_group ON church_prayers(translation_group_id, language);

CREATE TRIGGER IF NOT EXISTS trg_church_prayers_updated_at
    AFTER UPDATE ON church_prayers
    BEGIN
        UPDATE church_prayers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;
