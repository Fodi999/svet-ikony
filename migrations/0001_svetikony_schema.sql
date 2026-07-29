-- =============================================================================
-- svetikony — Cloudflare D1 schema (SQLite dialect)
-- =============================================================================
-- Source of truth: the 17 `church_*`/`icon_*`/`prayer_*` PostgreSQL migrations
-- in ../migrations/ (20260629000002 .. 20260717000001), consolidated here into
-- a single "current state" schema for a NEW, single-tenant D1 database.
--
-- This file only creates structure. It does not move data — that is a
-- separate step (export rows for site_id = '00000000-0000-0000-0000-000000000101'
-- UNION rows with is_global = true from the shared Postgres tables, then
-- transform per the notes below).
--
-- ── Design decisions made for this port (all reversible, flag if wrong) ──────
--
-- 1. SINGLE-TENANT: `site_id`, `is_global` and the `sites` table are dropped
--    entirely. The Postgres backend is shared by 3 sites (church/construction/
--    kitchen) and every church/icon/prayer table carried `site_id` + an
--    `is_global` escape hatch (`WHERE site_id = $1 OR is_global = true`) for
--    that reason. None of that multi-tenant plumbing is exercised by
--    svetikony in practice — grepping church_content.rs / church_orders.rs /
--    icons_site.rs / prayer_visualizer.rs shows zero references to `sites`,
--    and no other site's handlers touch these tables. A D1 database scoped to
--    svetikony alone has exactly one tenant, so the column is pure noise.
--    If that assumption is wrong (i.e. some other site really does read
--    is_global church rows), say so before the data-export step runs, since
--    dropping the column here means those rows would need to be re-added.
--
-- 2. UUIDs: Postgres used `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. D1/
--    SQLite has no UUID type and no gen_random_uuid(). Two options existed:
--    generate the id in the Rust app before INSERT, or fake it in SQL. The
--    existing Rust code (church_content.rs, church_orders.rs) never includes
--    `id` in its INSERT column lists — it always relies on the DB default and
--    reads the id back via `RETURNING id`. To keep that calling convention
--    working unchanged, every `id` column below gets a SQLite-side default
--    that synthesizes an RFC4122 v4-shaped UUID string via randomblob()/hex().
--    It is NOT cryptographically distinguishable from a real Postgres
--    gen_random_uuid() value and collisions are as unlikely as any v4 UUID.
--
-- 3. TIMESTAMPTZ -> TEXT, ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SS.SSSZ`), default
--    `strftime('%Y-%m-%dT%H:%M:%fZ','now')`. SQLite has no timezone-aware
--    type; storing as sortable ISO-8601 text is the standard idiom and keeps
--    string comparison == chronological comparison.
--
-- 4. JSONB -> TEXT holding a JSON string (`church_info.translations`,
--    `church_prayers.scene_timeline`, `church_prayers.subtitle_cues`). D1's
--    SQLite build ships the json1 extension, so `json_extract()` etc. still
--    work against these columns despite the TEXT type affinity.
--
-- 5. TEXT[] arrays (`church_info.gallery_images`, `icon_order_options.
--    gallery_urls`) -> TEXT holding a JSON array string (`'[]'` default).
--    SQLite has no native array type; this is the same encoding as (4).
--
-- 6. BOOLEAN -> INTEGER, 0/1, since SQLite has no boolean storage class.
--
-- 7. BIGINT -> INTEGER. SQLite INTEGER columns are already dynamically up to
--    8 bytes; there is no separate BIGINT storage class to preserve.
--
-- 8. `CREATE SEQUENCE icon_order_number_seq` + `nextval(...)` (used to build
--    order numbers like 'IK-000123') has no D1 equivalent. Replaced with a
--    one-row `icon_order_counters` table incremented via an atomic
--    `UPDATE ... SET next_value = next_value + 1 WHERE id = 1 RETURNING
--    next_value` (D1 supports RETURNING). The app formats the zero-padded
--    string itself (SQLite has no LPAD): `printf('%06d', next_value)`.
--
-- 9. Postgres `FOR EACH ROW EXECUTE FUNCTION set_updated_at()` reused one
--    PL/pgSQL function across many triggers. SQLite triggers cannot call a
--    shared function — each table gets its own inline
--    `AFTER UPDATE ... BEGIN UPDATE ... SET updated_at = ... END` trigger.
--    `church_saints` intentionally has NO such trigger below, matching the
--    Postgres migrations, where none was ever created for that table either
--    (flag if that was actually a bug worth fixing here instead of porting).
--
-- 10. Composite UNIQUE/INDEX definitions that included `site_id` (e.g.
--     `UNIQUE (site_id, slug, language)`) are narrowed to drop that column
--     per decision (1) above (e.g. `UNIQUE (slug, language)`).
--
-- 11. `DO $$ ... $$` backfill blocks and `pg_constraint`/`information_schema`
--     catalog lookups from the Postgres migrations (used for one-time
--     backfills, e.g. in 20260716000002_icon_product_categories.sql) are
--     Postgres-only and are not represented here — they did one-time data
--     repair on the old shared table and have no bearing on a fresh schema.
--
-- Not included in this file: the 46-letter x 3-language seed INSERT for
-- church_alphabet_letters (real content, not schema) — port it separately
-- as a seed/data step, not as part of the DDL.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ── shared UUID default expression, inlined per table (SQLite has no way to
--    define a reusable default expression outside a table definition) ────────
-- lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||
--       substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))

-- =============================================================================
-- church_calendar_days
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_calendar_days (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    date_old_style  TEXT,
    date_new_style  TEXT,
    calendar_type   TEXT NOT NULL DEFAULT 'both'
        CHECK (calendar_type IN ('old_style', 'new_style', 'both')),
    title           TEXT NOT NULL,
    day_type        TEXT NOT NULL DEFAULT 'saint'
        CHECK (day_type IN ('saint', 'feast', 'fasting', 'memorial', 'gospel', 'quiet')),
    description     TEXT NOT NULL DEFAULT '',
    rank            INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (date_old_style IS NOT NULL OR date_new_style IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_church_calendar_days_new_date ON church_calendar_days(date_new_style, rank DESC);
CREATE INDEX IF NOT EXISTS idx_church_calendar_days_old_date ON church_calendar_days(date_old_style, rank DESC);

CREATE TRIGGER IF NOT EXISTS trg_church_calendar_days_updated_at
    AFTER UPDATE ON church_calendar_days
    BEGIN
        UPDATE church_calendar_days SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- church_icons
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_icons (
    id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    calendar_day_id         TEXT REFERENCES church_calendar_days(id) ON DELETE SET NULL,
    title                   TEXT NOT NULL,
    slug                    TEXT NOT NULL,
    image_url               TEXT NOT NULL DEFAULT '',
    saint_name              TEXT NOT NULL DEFAULT '',
    feast_name              TEXT NOT NULL DEFAULT '',
    description             TEXT NOT NULL DEFAULT '',
    language                TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    translation_group_id    TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    order_enabled           INTEGER NOT NULL DEFAULT 0,
    order_block_text        TEXT NOT NULL DEFAULT '',
    production_time         TEXT NOT NULL DEFAULT '',
    price_cents             INTEGER,
    currency                TEXT NOT NULL DEFAULT 'UAH',
    consecration_available  INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_church_icons_calendar_day ON church_icons(calendar_day_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_icons_status ON church_icons(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_icons_translation_group ON church_icons(translation_group_id, language);

CREATE TRIGGER IF NOT EXISTS trg_church_icons_updated_at
    AFTER UPDATE ON church_icons
    BEGIN
        UPDATE church_icons SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- church_prayers
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_prayers (
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
    prayer_type             TEXT NOT NULL DEFAULT 'prayer'
        CHECK (prayer_type IN ('prayer', 'akathist', 'troparion', 'kontakion', 'velichanie', 'modern')),
    status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    translation_group_id    TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    visualizer_enabled       INTEGER NOT NULL DEFAULT 0,
    visualizer_image_url     TEXT NOT NULL DEFAULT '',
    particle_count_desktop   INTEGER NOT NULL DEFAULT 50000,
    particle_count_mobile    INTEGER NOT NULL DEFAULT 16000,
    particle_size            REAL NOT NULL DEFAULT 2.0,
    particle_color_mode      TEXT NOT NULL DEFAULT 'silver_gold'
        CHECK (particle_color_mode IN ('silver_gold', 'gold', 'silver', 'warm_white')),
    background_color         TEXT NOT NULL DEFAULT '#000000',
    audio_reactivity         REAL NOT NULL DEFAULT 0.5,
    scene_timeline            TEXT NOT NULL DEFAULT '{"idle":2000,"assemble":2500,"reveal":1500,"dissolve":2000}',
    subtitle_cues             TEXT NOT NULL DEFAULT '[]',
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_church_prayers_calendar_day ON church_prayers(calendar_day_id, prayer_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_prayers_icon ON church_prayers(icon_id, prayer_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_prayers_public_slug ON church_prayers(slug, status);
CREATE INDEX IF NOT EXISTS idx_church_prayers_translation_group ON church_prayers(translation_group_id, language);

CREATE TRIGGER IF NOT EXISTS trg_church_prayers_updated_at
    AFTER UPDATE ON church_prayers
    BEGIN
        UPDATE church_prayers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- church_articles
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_articles (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    icon_id           TEXT REFERENCES church_icons(id) ON DELETE SET NULL,
    calendar_day_id   TEXT REFERENCES church_calendar_days(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    slug              TEXT NOT NULL,
    content           TEXT NOT NULL DEFAULT '',
    language          TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    seo_title         TEXT NOT NULL DEFAULT '',
    seo_description   TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_church_articles_calendar_day ON church_articles(calendar_day_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_articles_icon ON church_articles(icon_id, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_church_articles_updated_at
    AFTER UPDATE ON church_articles
    BEGIN
        UPDATE church_articles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- church_gospel_readings
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_gospel_readings (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    icon_id           TEXT REFERENCES church_icons(id) ON DELETE SET NULL,
    calendar_day_id   TEXT REFERENCES church_calendar_days(id) ON DELETE SET NULL,
    slug              TEXT NOT NULL,
    title             TEXT NOT NULL,
    reference         TEXT NOT NULL DEFAULT '',
    text              TEXT NOT NULL DEFAULT '',
    explanation       TEXT NOT NULL DEFAULT '',
    language          TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_church_gospel_readings_calendar_day ON church_gospel_readings(calendar_day_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_gospel_readings_icon ON church_gospel_readings(icon_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_gospel_readings_public_slug ON church_gospel_readings(slug, status);

CREATE TRIGGER IF NOT EXISTS trg_church_gospel_readings_updated_at
    AFTER UPDATE ON church_gospel_readings
    BEGIN
        UPDATE church_gospel_readings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- church_saints
-- (No updated_at trigger — matches the Postgres migration, which never
--  defined one for this table either. Flag if that should be fixed here.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_saints (
    id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    icon_id                TEXT REFERENCES church_icons(id) ON DELETE SET NULL,
    calendar_day_id        TEXT REFERENCES church_calendar_days(id) ON DELETE SET NULL,
    slug                   TEXT NOT NULL,
    name                   TEXT NOT NULL,
    short_description      TEXT NOT NULL DEFAULT '',
    biography              TEXT NOT NULL DEFAULT '',
    feast_day              TEXT NOT NULL DEFAULT '',
    image_url              TEXT NOT NULL DEFAULT '',
    language               TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    translation_group_id   TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_church_saints_status ON church_saints(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_saints_translation_group ON church_saints(translation_group_id, language);
CREATE INDEX IF NOT EXISTS idx_church_saints_calendar_day ON church_saints(calendar_day_id, updated_at DESC);

-- =============================================================================
-- church_alphabet_letters
-- (Structure only — the 46 x 3-language seed content is ported separately.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_alphabet_letters (
    id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    slug                   TEXT NOT NULL,
    letter                 TEXT NOT NULL,
    sort_order             INTEGER NOT NULL DEFAULT 0,
    name                   TEXT NOT NULL,
    short_description      TEXT NOT NULL DEFAULT '',
    full_text              TEXT NOT NULL DEFAULT '',
    numeric_value          INTEGER,
    modern_equivalent      TEXT NOT NULL DEFAULT '',
    color                  TEXT NOT NULL DEFAULT '',
    card_image_url         TEXT NOT NULL DEFAULT '',
    main_image_url         TEXT NOT NULL DEFAULT '',
    seo_title              TEXT NOT NULL DEFAULT '',
    seo_description        TEXT NOT NULL DEFAULT '',
    language               TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en')),
    translation_group_id   TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_church_alphabet_status ON church_alphabet_letters(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_church_alphabet_translation_group ON church_alphabet_letters(translation_group_id, language);

CREATE TRIGGER IF NOT EXISTS trg_church_alphabet_letters_updated_at
    AFTER UPDATE ON church_alphabet_letters
    BEGIN
        UPDATE church_alphabet_letters SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- church_info
-- Single physical-church record. With multi-tenancy removed there is exactly
-- one row expected to ever exist; nothing in SQLite enforces "at most one
-- row" short of application discipline (Postgres enforced it via
-- UNIQUE(site_id), which no longer applies once site_id is gone).
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_info (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    address         TEXT NOT NULL DEFAULT '',
    maps_url        TEXT NOT NULL DEFAULT '',
    phone_or_site   TEXT NOT NULL DEFAULT '',
    priest_phone    TEXT NOT NULL DEFAULT '',
    image_url       TEXT NOT NULL DEFAULT '',
    translations    TEXT NOT NULL DEFAULT '{}',
    gallery_images  TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER IF NOT EXISTS trg_church_info_updated_at
    AFTER UPDATE ON church_info
    BEGIN
        UPDATE church_info SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- icon_product_categories
-- =============================================================================
CREATE TABLE IF NOT EXISTS icon_product_categories (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    slug              TEXT NOT NULL UNIQUE,
    name_uk           TEXT NOT NULL DEFAULT '',
    name_ru           TEXT NOT NULL DEFAULT '',
    name_en           TEXT NOT NULL DEFAULT '',
    description_uk    TEXT NOT NULL DEFAULT '',
    description_ru    TEXT NOT NULL DEFAULT '',
    description_en    TEXT NOT NULL DEFAULT '',
    image_url         TEXT NOT NULL DEFAULT '',
    is_active         INTEGER NOT NULL DEFAULT 1,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_icon_product_categories_active ON icon_product_categories(is_active, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_icon_product_categories_updated_at
    AFTER UPDATE ON icon_product_categories
    BEGIN
        UPDATE icon_product_categories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- icon_order_options  (== the product catalog: add-on options + orderable icons)
-- =============================================================================
CREATE TABLE IF NOT EXISTS icon_order_options (
    id                              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    slug                            TEXT NOT NULL UNIQUE,
    name_uk                         TEXT NOT NULL DEFAULT '',
    name_ru                         TEXT NOT NULL DEFAULT '',
    name_en                         TEXT NOT NULL DEFAULT '',
    photo_url                       TEXT NOT NULL DEFAULT '',
    price_cents                     INTEGER NOT NULL DEFAULT 0,
    currency                        TEXT NOT NULL DEFAULT 'UAH',
    is_active                       INTEGER NOT NULL DEFAULT 1,
    sort_order                      INTEGER NOT NULL DEFAULT 0,
    category_id                     TEXT REFERENCES icon_product_categories(id) ON DELETE SET NULL,
    description                     TEXT NOT NULL DEFAULT '',
    linked_icon_translation_group_id TEXT,
    full_description_uk             TEXT NOT NULL DEFAULT '',
    full_description_ru             TEXT NOT NULL DEFAULT '',
    full_description_en             TEXT NOT NULL DEFAULT '',
    gallery_urls                    TEXT NOT NULL DEFAULT '[]',
    production_time                 TEXT NOT NULL DEFAULT '',
    consecration_available          INTEGER NOT NULL DEFAULT 0,
    stock_status                    TEXT NOT NULL DEFAULT 'available'
        CHECK (stock_status IN ('available', 'made_to_order', 'unavailable')),
    featured                        INTEGER NOT NULL DEFAULT 0,
    seo_title_uk                    TEXT NOT NULL DEFAULT '',
    seo_title_ru                    TEXT NOT NULL DEFAULT '',
    seo_title_en                    TEXT NOT NULL DEFAULT '',
    seo_description_uk              TEXT NOT NULL DEFAULT '',
    seo_description_ru              TEXT NOT NULL DEFAULT '',
    seo_description_en              TEXT NOT NULL DEFAULT '',
    created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_icon_order_options_active ON icon_order_options(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_icon_order_options_linked_icon_group ON icon_order_options(linked_icon_translation_group_id);
CREATE INDEX IF NOT EXISTS idx_icon_order_options_featured ON icon_order_options(featured) WHERE featured = 1;

CREATE TRIGGER IF NOT EXISTS trg_icon_order_options_updated_at
    AFTER UPDATE ON icon_order_options
    BEGIN
        UPDATE icon_order_options SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- icon_order_counters
-- Replaces `CREATE SEQUENCE icon_order_number_seq` + `nextval(...)`.
-- Usage from the app: atomically claim the next number with
--   UPDATE icon_order_counters SET next_value = next_value + 1
--   WHERE id = 1 RETURNING next_value;
-- then format as 'IK-' || printf('%06d', next_value) in place of the old
-- Postgres `'IK-' || LPAD(nextval('icon_order_number_seq')::text, 6, '0')`.
-- Seeded at 0, not 1: `nextval()` on a fresh Postgres sequence returns 1 on
-- its FIRST call (pre-increment happens internally); the UPDATE above
-- increments-then-returns, so the counter must start one below the first
-- number to hand out for the two to match (IK-000001 first, not IK-000002).
-- =============================================================================
CREATE TABLE IF NOT EXISTS icon_order_counters (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    next_value  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO icon_order_counters (id, next_value) VALUES (1, 0);

-- =============================================================================
-- icon_orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS icon_orders (
    id                                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    order_number                           TEXT NOT NULL UNIQUE,
    icon_id                                TEXT REFERENCES church_icons(id) ON DELETE SET NULL,
    icon_title_snapshot                    TEXT NOT NULL DEFAULT '',
    icon_slug_snapshot                     TEXT NOT NULL DEFAULT '',
    customer_name                          TEXT NOT NULL,
    contact_method                         TEXT NOT NULL CHECK (contact_method IN ('phone', 'email')),
    contact_value                          TEXT NOT NULL,
    preferred_contact_channel              TEXT NOT NULL DEFAULT '',
    country                                TEXT NOT NULL DEFAULT '',
    city                                   TEXT NOT NULL DEFAULT '',
    consecration_requested                 INTEGER NOT NULL DEFAULT 0,
    comment                                TEXT NOT NULL DEFAULT '',
    consent_given                          INTEGER NOT NULL DEFAULT 0,
    status                                 TEXT NOT NULL DEFAULT 'new' CHECK (status IN
        ('new', 'contacted', 'confirmed', 'in_production', 'ready', 'shipped', 'completed', 'cancelled')),
    admin_note                             TEXT NOT NULL DEFAULT '',
    total_price_cents                      INTEGER NOT NULL DEFAULT 0,
    currency                               TEXT NOT NULL DEFAULT 'UAH',
    is_read                                INTEGER NOT NULL DEFAULT 0,
    client_ip                              TEXT,
    primary_product_id                     TEXT REFERENCES icon_order_options(id) ON DELETE SET NULL,
    primary_product_name_snapshot          TEXT NOT NULL DEFAULT '',
    primary_product_slug_snapshot          TEXT NOT NULL DEFAULT '',
    primary_product_price_cents_snapshot   INTEGER NOT NULL DEFAULT 0,
    primary_product_photo_snapshot         TEXT NOT NULL DEFAULT '',
    created_at                             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at                             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_icon_orders_status ON icon_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_icon_orders_unread ON icon_orders(is_read) WHERE is_read = 0;

CREATE TRIGGER IF NOT EXISTS trg_icon_orders_updated_at
    AFTER UPDATE ON icon_orders
    BEGIN
        UPDATE icon_orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;

-- =============================================================================
-- icon_order_items
-- =============================================================================
CREATE TABLE IF NOT EXISTS icon_order_items (
    id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    order_id                TEXT NOT NULL REFERENCES icon_orders(id) ON DELETE CASCADE,
    option_id               TEXT REFERENCES icon_order_options(id) ON DELETE SET NULL,
    option_name_snapshot    TEXT NOT NULL,
    price_cents_snapshot    INTEGER NOT NULL DEFAULT 0,
    quantity                INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_icon_order_items_order ON icon_order_items(order_id);

-- =============================================================================
-- church_prayer_visualizer_assets
-- =============================================================================
CREATE TABLE IF NOT EXISTS church_prayer_visualizer_assets (
    id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    prayer_id                   TEXT NOT NULL UNIQUE REFERENCES church_prayers(id) ON DELETE CASCADE,
    source_image_url            TEXT NOT NULL DEFAULT '',
    desktop_map_url              TEXT NOT NULL DEFAULT '',
    mobile_map_url               TEXT NOT NULL DEFAULT '',
    low_power_map_url            TEXT NOT NULL DEFAULT '',
    fallback_image_url           TEXT NOT NULL DEFAULT '',
    thumbnail_url                TEXT NOT NULL DEFAULT '',
    desktop_particle_count       INTEGER NOT NULL DEFAULT 0,
    mobile_particle_count        INTEGER NOT NULL DEFAULT 0,
    low_power_particle_count     INTEGER NOT NULL DEFAULT 0,
    processing_status            TEXT NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
    processing_error             TEXT NOT NULL DEFAULT '',
    processing_version           INTEGER NOT NULL DEFAULT 0,
    created_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_church_prayer_visualizer_assets_status ON church_prayer_visualizer_assets(processing_status);

CREATE TRIGGER IF NOT EXISTS trg_church_prayer_visualizer_assets_updated_at
    AFTER UPDATE ON church_prayer_visualizer_assets
    BEGIN
        UPDATE church_prayer_visualizer_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;
