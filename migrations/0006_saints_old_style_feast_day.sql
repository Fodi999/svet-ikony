-- Saints get the same old-style/new-style dual date church_calendar_days
-- already has (date_old_style/date_new_style). feast_day only ever held
-- one calendar's date with no way to say which — rename it to
-- feast_day_new_style (keeping its existing values, all Gregorian) and add
-- feast_day_old_style alongside it. Plain RENAME COLUMN + ADD COLUMN, no
-- CHECK constraint involved, so no table rebuild needed (unlike 0003/0004).
ALTER TABLE church_saints RENAME COLUMN feast_day TO feast_day_new_style;
ALTER TABLE church_saints ADD COLUMN feast_day_old_style TEXT NOT NULL DEFAULT '';
