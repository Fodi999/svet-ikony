-- Adds gallery_metadata to church_icons: provenance for gallery photos
-- that were AI-generated portfolio/lifestyle variants of the icon's own
-- main photo (see lib/church/icon-portfolio-actions.ts), so a future
-- reader can always tell "this gallery image was generated from that
-- source photo, using this preset, at this time" rather than treating
-- every gallery entry as an indistinguishable manual upload.
--
-- Deliberately a JSON OBJECT keyed by the gallery image's own URL/key
-- (not a parallel array aligned by index to gallery_urls): the existing
-- admin UI already lets an admin reorder or remove individual gallery
-- photos, and an index-aligned array would silently misalign the moment
-- that happens. Keying by URL means removing/reordering a photo can only
-- ever orphan its own metadata entry (harmless), never mislabel a
-- different photo's provenance as this one's.

ALTER TABLE church_icons ADD COLUMN gallery_metadata TEXT;
