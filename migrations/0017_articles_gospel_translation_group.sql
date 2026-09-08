-- Adds translation_group_id to church_articles and church_gospel_readings,
-- the two content tables that never got this column (unlike
-- church_calendar_days/church_icons/church_prayers/church_saints/
-- church_alphabet_letters, all of which already have it). Additive only.
-- Every existing row gets its own independent random group id on backfill
-- (correct: none of today's rows have a real translation counterpart yet),
-- matching the exact DEFAULT expression migration 0003 already uses for
-- church_calendar_days.

ALTER TABLE church_articles ADD COLUMN translation_group_id TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))));

ALTER TABLE church_gospel_readings ADD COLUMN translation_group_id TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))));
