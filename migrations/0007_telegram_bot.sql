-- Telegram bot ("Світло Ікони") — additive only, own tables, own prefix.
-- Nothing here touches church_*/icon_*/d1_migrations; telegram_posts links
-- to existing content via (source_type, source_id) instead of copying it,
-- and source_id is TEXT because every church_*/icon_* table's `id` is TEXT
-- (UUID), not INTEGER — confirmed against production via
-- `PRAGMA table_info(...)` before writing this, not assumed.
CREATE TABLE IF NOT EXISTS telegram_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER NOT NULL UNIQUE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT,
    is_bot INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_chat_id INTEGER NOT NULL UNIQUE,
    chat_type TEXT NOT NULL,
    title TEXT,
    username TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER,
    telegram_chat_id INTEGER,
    subscription_type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(telegram_user_id, telegram_chat_id, subscription_type)
);

-- source_type/source_id point at an existing content row (e.g.
-- source_type='prayer', source_id=<church_prayers.id>) instead of copying
-- its text/media into this table — see lib/telegram/README in the repo
-- report for which source_type values are wired up.
CREATE TABLE IF NOT EXISTS telegram_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_chat_id INTEGER NOT NULL,
    source_type TEXT,
    source_id TEXT,
    text TEXT,
    media_url TEXT,
    telegram_message_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    scheduled_at TEXT,
    sent_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_delivery_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_post_id INTEGER,
    telegram_chat_id INTEGER,
    telegram_message_id INTEGER,
    status TEXT NOT NULL,
    response_code INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_user_id
ON telegram_users(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_chats_chat_id
ON telegram_chats(telegram_chat_id);

CREATE INDEX IF NOT EXISTS idx_telegram_posts_status
ON telegram_posts(status);

CREATE INDEX IF NOT EXISTS idx_telegram_posts_scheduled_at
ON telegram_posts(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_telegram_delivery_logs_post_id
ON telegram_delivery_logs(telegram_post_id);
