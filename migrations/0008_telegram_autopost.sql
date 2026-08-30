-- Autonomous Telegram autopost — additive only.
--
-- content_type/publish_date + the partial unique index below are what make
-- cron-triggered publishing double-publish-safe: an autopost tick claims a
-- slot via `INSERT ... ON CONFLICT(publish_date, content_type) DO NOTHING
-- RETURNING *` — only the tick that actually inserts a row proceeds to call
-- OpenAI/Telegram. The index is partial (WHERE content_type IS NOT NULL) so
-- it never constrains manually-composed posts, which leave both columns NULL.
ALTER TABLE telegram_posts ADD COLUMN content_type TEXT;
ALTER TABLE telegram_posts ADD COLUMN publish_date TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_posts_autopost_slot
ON telegram_posts(publish_date, content_type)
WHERE content_type IS NOT NULL;

-- Global kill switch. Defaults OFF — applying this migration must never by
-- itself start autonomous posting; an admin flips it on deliberately via the
-- "Автопублікація" tab after reviewing the per-type schedule below.
CREATE TABLE IF NOT EXISTS telegram_autopost_global_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO telegram_autopost_global_settings (id, enabled) VALUES (1, 0);

-- Per-content-type schedule, Europe/Kyiv wall-clock HH:MM. Seeded with the
-- five requested slots; each can be individually enabled/disabled and
-- retimed from the admin UI without a code change.
CREATE TABLE IF NOT EXISTS telegram_autopost_settings (
    content_type TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    schedule_time TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO telegram_autopost_settings (content_type, schedule_time) VALUES
    ('morning_prayer', '07:00'),
    ('saint_of_day', '10:00'),
    ('gospel', '13:00'),
    ('faith_story', '17:00'),
    ('evening_prayer', '20:00');
