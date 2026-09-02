-- Additive only: church_calendar_days had no SEO fields at all (unlike
-- church_articles, which already has seo_title/seo_description) -- needed
-- so the public calendar-day page's generateMetadata() can use real,
-- admin-curated SEO copy instead of always synthesizing it from
-- title/description. NULL means "not set yet", not "explicitly empty" --
-- callers fall back to title/description exactly like the articles page
-- already does for its own seoTitle/seoDescription.
ALTER TABLE church_calendar_days ADD COLUMN seo_title TEXT;
ALTER TABLE church_calendar_days ADD COLUMN seo_description TEXT;
