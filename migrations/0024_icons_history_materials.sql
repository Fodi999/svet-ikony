-- Adds the 4 columns the admin's Icon form has always exposed (Історія,
-- Опис образу святого, Матеріали, Розміри) but which church_icons never
-- actually had -- confirmed by reading svetikony-admin's own
-- lib/api/http/icons.ts: toEntity() hardcoded these to undefined on every
-- read and toPayload() never sent them on write, so anything an admin
-- typed into these fields was silently discarded on save. All four are
-- plain public display copy (history/saint-image description are
-- educational text, materials/dimensions are ordinary product facts) --
-- nothing here is admin-only the way internal_note was, so no redaction
-- is needed on the public read side.

ALTER TABLE church_icons ADD COLUMN history TEXT;
ALTER TABLE church_icons ADD COLUMN saint_image_description TEXT;
ALTER TABLE church_icons ADD COLUMN materials TEXT;
ALTER TABLE church_icons ADD COLUMN dimensions TEXT;
