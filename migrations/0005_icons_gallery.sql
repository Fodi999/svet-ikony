-- Stage 2K follow-up: church_icons gets a real photo gallery, matching
-- icon_order_options.gallery_urls' shape (TEXT holding a JSON array
-- string, default '[]'). A plain ADD COLUMN is enough here — unlike the
-- 0003/0004 migrations, this doesn't touch any CHECK constraint, so no
-- table rebuild is needed.
ALTER TABLE church_icons ADD COLUMN gallery_urls TEXT NOT NULL DEFAULT '[]';
