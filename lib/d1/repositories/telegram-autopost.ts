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

/** The daily "visit the site" CTA broadcast's own settings row (migration
 * 0013) -- lives in this same table, but deliberately read separately from
 * getAutopostSettings() above, which filters to isAutopostContentType()
 * rows only (by design, not by accident -- see that function's own doc
 * comment). Returns null only if the migration hasn't been applied yet. */
export const PROMO_BROADCAST_CONTENT_TYPE = 'promo_broadcast';

export type PromoBroadcastSettingsDto = { enabled: boolean; scheduleTime: string };

export async function getPromoBroadcastSettings(): Promise<PromoBroadcastSettingsDto | null> {
  const row = await d1First<SettingRow>(
    'SELECT content_type, enabled, schedule_time, updated_at FROM telegram_autopost_settings WHERE content_type = ?',
    PROMO_BROADCAST_CONTENT_TYPE
  );
  if (!row) return null;
  return { enabled: row.enabled === 1, scheduleTime: row.schedule_time };
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
 * unique index. Returns the row this call won the claim on (either a
 * fresh insert, or an existing but still-`draft` row reclaimed for a
 * retry — see below), or `null` when the slot is already occupied by a
 * row this call must not touch (`sent`/`failed`/`ready`/`sending`).
 * Callers must not call OpenAI/Telegram unless this returns non-null.
 *
 * The `DO UPDATE ... WHERE telegram_posts.status = 'draft'` branch exists
 * for Content Plan Stage 2: an admin's "generate text"/"save draft" action
 * (see content-plan-actions.ts's findOrCreatePreparedSlot) can leave a
 * `draft` row sitting in this slot before it's ever marked `ready`. Without
 * this branch, this INSERT would conflict on that row, return nothing, and
 * the tick would log `skipped_already_claimed` forever — an abandoned
 * draft would silently block autonomous publishing for that slot with
 * nothing ever sent. Reclaiming it (refreshing the chat/source columns and
 * letting the existing generation flow run against it) is a strict
 * superset of the old behavior: a `sent`/`failed`/`ready`/`sending`
 * conflict still falls through the `WHERE` unmatched, which SQLite treats
 * as `DO NOTHING` — `null` returned, identical to before this change.
 * `ready`/`sending` slots are handled separately and first by
 * claimReadyAutopostSlot(), which is always tried before this function.
 */
export async function claimAutopostSlot(input: ClaimAutopostSlotInput): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `INSERT INTO telegram_posts (telegram_chat_id, source_type, source_id, status, content_type, publish_date)
     VALUES (?, ?, ?, 'draft', ?, ?)
     ON CONFLICT(publish_date, content_type) WHERE content_type IS NOT NULL
     DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id, source_type = excluded.source_type,
                   source_id = excluded.source_id, updated_at = CURRENT_TIMESTAMP
     WHERE telegram_posts.status = 'draft'
     RETURNING ${POST_COLUMNS}`,
    input.channelChatId,
    input.sourceType ?? null,
    input.sourceId ?? null,
    input.contentType,
    input.publishDate
  );
  return row ? toPostDto(row) : null;
}

/**
 * Same (publish_date, content_type) atomic claim as claimAutopostSlot()
 * above, deliberately simplified: a plain `DO NOTHING` on conflict, no
 * "reclaim a draft row" branch. That branch exists there only to pick up
 * a Content Plan Stage 2 admin's own pre-generated draft -- the promo
 * broadcast has no such per-day preparation step, so there's nothing to
 * reclaim. A failed send (this claim wins but the Telegram call throws)
 * simply stays `failed` for today, matching the existing autopost rule
 * ("a failed slot is never auto-retried" -- see claimReadyAutopostSlot's
 * own doc comment) -- tomorrow's tick claims a fresh row for the new date
 * regardless, so this recurring message is self-healing on its own
 * cadence without needing a manual-retry path.
 */
export async function claimPromoBroadcastSlot(chatId: number, publishDate: string, text: string): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `INSERT INTO telegram_posts (telegram_chat_id, text, status, content_type, publish_date)
     VALUES (?, ?, 'draft', ?, ?)
     ON CONFLICT(publish_date, content_type) WHERE content_type IS NOT NULL
     DO NOTHING
     RETURNING ${POST_COLUMNS}`,
    chatId,
    text,
    PROMO_BROADCAST_CONTENT_TYPE,
    publishDate
  );
  return row ? toPostDto(row) : null;
}

/**
 * Content Plan Stage 2's "use the prepared slot" fast path: atomically
 * transitions an admin-confirmed `ready` row to `sending` so exactly one
 * caller (this tick, not a second overlapping one, not a concurrent
 * manual retry) proceeds to actually call Telegram for it. Returns `null`
 * when no `ready` row exists for this slot (nothing prepared -- the
 * ordinary claimAutopostSlot()/generation fallback applies instead) or
 * when another caller already won the transition moments earlier.
 * Never reverted back to `ready` on failure -- see
 * lib/telegram/autopost.ts, which marks it `failed` instead, matching the
 * existing "a failed autopost slot is never auto-retried" rule.
 */
export async function claimReadyAutopostSlot(contentType: AutopostContentType, publishDate: string): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET status = 'sending', updated_at = CURRENT_TIMESTAMP
     WHERE publish_date = ? AND content_type = ? AND status = 'ready'
     RETURNING ${POST_COLUMNS}`,
    publishDate,
    contentType
  );
  return row ? toPostDto(row) : null;
}

/**
 * Looks up the (at most one, per migration 0008's unique index) row for a
 * slot without claiming/creating anything -- used by the Content Plan
 * admin actions to decide "does this slot already have a prepared row?"
 * before deciding to create one. Read-only.
 */
export async function findTelegramPostBySlot(contentType: AutopostContentType, publishDate: string): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `SELECT ${POST_COLUMNS} FROM telegram_posts WHERE publish_date = ? AND content_type = ?`,
    publishDate,
    contentType
  );
  return row ? toPostDto(row) : null;
}

/**
 * Content Plan Stage 2's admin-facing "get me a row to work with" --
 * unlike claimAutopostSlot() (the tick's exclusive claim, which refuses to
 * touch anything but a fresh or abandoned-`draft` slot), this always
 * returns the existing row untouched if one exists in ANY status, or
 * creates a fresh `draft` one if none does. Callers (generateSlotText,
 * editSlotText, etc.) are responsible for rejecting a `sent`/`sending` row
 * themselves before mutating it -- this function only ever fetches-or-
 * creates, it never mutates an existing row's content.
 */
export async function findOrCreatePreparedSlot(input: ClaimAutopostSlotInput): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `INSERT INTO telegram_posts (telegram_chat_id, source_type, source_id, status, content_type, publish_date)
     VALUES (?, ?, ?, 'draft', ?, ?)
     ON CONFLICT(publish_date, content_type) WHERE content_type IS NOT NULL
     DO UPDATE SET status = telegram_posts.status
     RETURNING ${POST_COLUMNS}`,
    input.channelChatId,
    input.sourceType ?? null,
    input.sourceId ?? null,
    input.contentType,
    input.publishDate
  );
  if (!row) throw ApiError.conflict('failed to resolve the prepared slot row');
  return toPostDto(row);
}

/**
 * Persists text from any of generateSlotText/regenerateSlotText/
 * editSlotText (content-plan-actions.ts) -- always demotes `ready` back to
 * `draft` (a text change invalidates a prior "confirmed good to send"),
 * and is a defensive no-op on status for an already-`sent` row (callers
 * must reject `sent` before ever reaching this, this is belt-and-suspenders
 * against ever silently rewriting delivered content).
 */
export async function setPreparedPostText(id: number, text: string): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts
     SET text = ?, status = CASE WHEN status = 'sent' THEN status ELSE 'draft' END, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING ${POST_COLUMNS}`,
    text,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}

/**
 * Content Plan Stage 2's "Позначити готовим" -- only ever transitions
 * `draft` -> `ready`; a `sent`/`failed`/`ready`/`sending` row is returned
 * unchanged (callers check the returned row's own status to detect a
 * no-op and surface a clear error, since D1 can't distinguish "not found"
 * from "found but wrong status" via RETURNING alone).
 */
export async function setAutopostSlotReady(id: number): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft' RETURNING ${POST_COLUMNS}`,
    id
  );
  return row ? toPostDto(row) : null;
}

/** The inverse of setAutopostSlotReady() -- only `ready` -> `draft`. */
export async function setAutopostSlotUnready(id: number): Promise<TelegramPostDto | null> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ready' RETURNING ${POST_COLUMNS}`,
    id
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

/**
 * Records the outcome of the (best-effort, non-fatal) AI image step -- see
 * lib/telegram/autopost-image.ts. Exactly one of the two arguments is
 * meaningful per call: a successful generation passes `mediaUrl` and
 * `imageError: null`; a failure passes `mediaUrl: null` and the failure
 * reason, leaving the post publishable text-only. Never called once
 * mediaUrl is already set -- see ensureAutopostImage()'s own skip check.
 */
export async function setAutopostImageResult(id: number, mediaUrl: string | null, imageError: string | null): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET media_url = ?, image_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING ${POST_COLUMNS}`,
    mediaUrl,
    imageError,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}

/**
 * Audio counterpart of setAutopostImageResult -- but audio has no
 * generation step to fail (manual assignment only, see
 * content-plan-actions.ts's assignSlotAudio/removeSlotAudio), so there's
 * no error column to set alongside it. Deliberately does NOT touch
 * `status` -- matches setAutopostImageResult's own existing behavior
 * (confirmed during the pre-implementation audit: assigning/regenerating
 * an image never demotes a 'ready' slot back to 'draft', unlike
 * setPreparedPostText for text edits), so a READY slot stays READY when
 * its audio is assigned, changed, or removed (mediaUrl: null), per this
 * task's explicit "no demotion on media edit" decision.
 */
export async function setAutopostAudioResult(id: number, audioUrl: string | null): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET audio_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING ${POST_COLUMNS}`,
    audioUrl,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}

export type AutopostVerificationResultInput = {
  status: 'verified' | 'failed';
  checkedAt: string;
  sources: string[];
  error: string | null;
};

/**
 * Records the outcome of the mandatory pre-publish calendar verification
 * (migration 0010) -- see lib/telegram/orthodox-calendar-verifier.ts.
 * Called right after claimAutopostSlot for content types that require it
 * (saint_of_day), before OpenAI/image/Telegram are ever touched -- a
 * `status: 'failed'` row is never followed by a generation or send call.
 */
export async function setAutopostVerificationResult(id: number, input: AutopostVerificationResultInput): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET verification_status = ?, verification_checked_at = ?, verification_sources = ?, verification_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING ${POST_COLUMNS}`,
    input.status,
    input.checkedAt,
    JSON.stringify(input.sources),
    input.error,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}
