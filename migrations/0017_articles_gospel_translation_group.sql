-- Adds translation_group_id to church_articles and church_gospel_readings,
-- the two content tables that never got this column (unlike
-- church_calendar_days/church_icons/church_prayers/church_saints/
-- church_alphabet_letters, all of which already have it). Additive only.
--
-- IMPORTANT -- do not "simplify" this back to a single
-- `ALTER TABLE ... ADD COLUMN translation_group_id TEXT NOT NULL DEFAULT
-- (<randomblob expr>)` statement. That was the first version of this
-- migration and it was WRONG: SQLite (and D1) rejects a non-constant
-- DEFAULT on ADD COLUMN against a non-empty table outright --
-- "Cannot add a column with non-constant default: SQLITE_ERROR" --
-- confirmed empirically against local D1 with real, non-empty
-- church_articles/church_gospel_readings data before this fix. (The
-- earlier migration 0003_calendar_days_extend.sql got away with the same
-- pattern only because church_calendar_days was still empty when it ran --
-- there were no existing rows to backfill, so the restriction never
-- triggered.)
--
-- The safe pattern for a non-empty table: add the column with no default
-- (nullable) first, then UPDATE each row individually. UPDATE evaluates
-- its SET expression once PER MATCHING ROW (ordinary SQL semantics),
-- unlike ADD COLUMN's DEFAULT (evaluated once for the whole statement and
-- copied into every pre-existing row) -- so every existing article/gospel
-- row gets its own independent, genuinely-unique group id, not one
-- shared value.
--
-- The column is intentionally left nullable at the schema level (SQLite
-- can't add a NOT NULL constraint to an existing column without a full
-- table rebuild) -- the UPDATE below guarantees every existing row is
-- non-null in practice, and every future INSERT goes through
-- createArticle()/createGospel() (lib/d1/repositories/articles.ts,
-- gospel.ts), which always supplies a real value via
-- COALESCE(existing-sibling-by-slug, fresh-uuid), never NULL.
--
-- Rollback, if ever needed: `ALTER TABLE church_articles DROP COLUMN
-- translation_group_id;` / same for church_gospel_readings (D1/SQLite
-- supports DROP COLUMN). No down-migration file -- this project's
-- migrations are forward-only, matching every other file in this directory.

ALTER TABLE church_articles ADD COLUMN translation_group_id TEXT;
ALTER TABLE church_gospel_readings ADD COLUMN translation_group_id TEXT;

UPDATE church_articles
SET translation_group_id = (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))))
WHERE translation_group_id IS NULL;

UPDATE church_gospel_readings
SET translation_group_id = (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))))
WHERE translation_group_id IS NULL;
