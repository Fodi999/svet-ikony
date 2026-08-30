import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { POST_COLUMNS, toPostDto, type PostRow, type TelegramPostDto } from './telegram';

/** Settings + the atomic slot-claim for autonomous Telegram autopost
 * (migration 0008_telegram_autopost.sql). See lib/telegram/autopost.ts for
 * the orchestrator that actually uses claimAutopostSlot(). */

export const AUTOPOST_CONTENT_TYPES = ['morning_prayer', 'saint_of_day', 'gospel', 'faith_story', 'evening_prayer'] as const;
export type AutopostContentType = (typeof AUTOPOST_CONTENT_TYPES)[number];

export function isAutopostContentType(value: string): value is AutopostContentType {
  return (AUTOPOST_CONTENT_TYPES as readonly string[]).includes(value);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type GlobalRow = { id: number; enabled: number; updated_at: string };
type SettingRow = { content_type: string; enabled: number; schedule_time: string; updated_at: string };

export type AutopostSettingDto = {
  contentType: AutopostContentType;
  enabled: boolean;
  scheduleTime: string;
};

export type AutopostSettingsDto = {
  globalEnabled: boolean;
  items: AutopostSettingDto[];
};

/** Admin "Автопублікація" tab + the tick route's own schedule check. */
export async function getAutopostSettings(): Promise<AutopostSettingsDto> {
  const [globalRow, rows] = await Promise.all([
    d1First<GlobalRow>('SELECT id, enabled, updated_at FROM telegram_autopost_global_settings WHERE id = 1'),
    d1All<SettingRow>('SELECT content_type, enabled, schedule_time, updated_at FROM telegram_autopost_settings ORDER BY content_type'),
  ]);

  const items = rows
    .filter((row) => isAutopostContentType(row.content_type))
    .map((row) => ({
      contentType: row.content_type as AutopostContentType,
      enabled: row.enabled === 1,
      scheduleTime: row.schedule_time,
    }));

  return { globalEnabled: globalRow?.enabled === 1, items };
}

export type AutopostSettingsUpdateInput = {
  globalEnabled?: boolean;
  items?: { contentType: string; enabled?: boolean; scheduleTime?: string }[];
};

/** Updates only the fields provided; the five per-type rows always exist
 * (seeded by the migration), so unknown content types are ignored rather
 * than silently inserting a stray row nothing else expects. */
export async function updateAutopostSettings(input: AutopostSettingsUpdateInput): Promise<AutopostSettingsDto> {
  if (input.globalEnabled !== undefined) {
    await d1Run(
      `INSERT INTO telegram_autopost_global_settings (id, enabled) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
      input.globalEnabled ? 1 : 0
    );
  }

  for (const item of input.items ?? []) {
    if (!isAutopostContentType(item.contentType)) continue;
    if (item.scheduleTime !== undefined && !TIME_PATTERN.test(item.scheduleTime)) {
      throw ApiError.validation(`schedule_time for ${item.contentType} must be HH:MM`);
    }

    const current = await d1First<SettingRow>(
      'SELECT content_type, enabled, schedule_time, updated_at FROM telegram_autopost_settings WHERE content_type = ?',
      item.contentType
    );
    if (!current) continue;

    await d1Run(
      `UPDATE telegram_autopost_settings SET enabled = ?, schedule_time = ?, updated_at = CURRENT_TIMESTAMP WHERE content_type = ?`,
      item.enabled !== undefined ? (item.enabled ? 1 : 0) : current.enabled,
      item.scheduleTime ?? current.schedule_time,
      item.contentType
    );
  }

  return getAutopostSettings();
}

export type ClaimAutopostSlotInput = {
  contentType: AutopostContentType;
  /** 'YYYY-MM-DD' in Europe/Kyiv — see lib/telegram/autopost.ts's kyivDateIso(). */
  publishDate: string;
  channelChatId: number;
  sourceType?: string | null;
  sourceId?: string | null;
};

/**
 * Atomic claim on (publish_date, content_type) — migration 0008's partial
 * unique index. Returns the newly-created draft row when this call won the
 * claim, or `null` when a row for that slot+day already exists (an earlier
 * tick today, whether it went on to succeed or fail). Callers must not call
 * OpenAI/Telegram unless this returns non-null.
 */
export async function claimAutopostSlot(input: ClaimAutopostSlotInput): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `INSERT INTO telegram_posts (telegram_chat_id, source_type, source_id, status, content_type, publish_date)
     VALUES (?, ?, ?, 'draft', ?, ?)
     ON CONFLICT(publish_date, content_type) WHERE content_type IS NOT NULL DO NOTHING
     RETURNING ${POST_COLUMNS}`,
    input.channelChatId,
    input.sourceType ?? null,
    input.sourceId ?? null,
    input.contentType,
    input.publishDate
  );
  return row ? toPostDto(row) : null;
}

/** Sets the claimed row's generated text before attempting to publish it —
 * kept separate from claimAutopostSlot so a claim always exists (and blocks
 * re-attempts) even if OpenAI generation itself fails right after. */
export async function setAutopostDraftText(id: number, text: string): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING ${POST_COLUMNS}`,
    text,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}
