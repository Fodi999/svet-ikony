-- Adds internal_note to church_calendar_days: a free-text admin-only note
-- (e.g. "double-check this citation", "waiting on translator"), never
-- surfaced on the public site. Nullable with no default -- unlike
-- audio_url (migration 0018), an empty note and "no note at all" don't
-- need to be distinguished from NULL for any reader, so a plain NULL
-- default is simplest and matches seo_title/seo_description's own
-- nullable convention (migration 0012).

ALTER TABLE church_calendar_days ADD COLUMN internal_note TEXT;
