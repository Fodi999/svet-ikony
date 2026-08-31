-- Additive only: pre-publish calendar verification result for autopost
-- rows that assert a specific saint/commemoration (see
-- lib/telegram/orthodox-calendar-verifier.ts). Recorded so it's visible in
-- telegram_posts *why* a saint_of_day publish was allowed or blocked,
-- rather than a silent skip -- see lib/telegram/autopost.ts's
-- skipped_verification_failed outcome.
--
-- verification_status is NULL for content types that don't require this
-- check (morning_prayer, evening_prayer, gospel, faith_story) and for
-- rows created before this migration -- never assume NULL means verified.
ALTER TABLE telegram_posts ADD COLUMN verification_status TEXT;
ALTER TABLE telegram_posts ADD COLUMN verification_checked_at TEXT;
ALTER TABLE telegram_posts ADD COLUMN verification_sources TEXT;
ALTER TABLE telegram_posts ADD COLUMN verification_error TEXT;
