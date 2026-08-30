import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';

/** telegram_users / telegram_chats / telegram_posts / telegram_delivery_logs
 * — additive tables from migrations/0007_telegram_bot.sql, isolated from the
 * church_ and icon_ content schema. telegram_subscriptions still exists as
 * schema only (broadcast-to-individual-chats feature, explicitly out of
 * scope for this stage) — everything below only ever targets the single
 * resolved channel chat (see lib/telegram/channel.ts). */

type UserRow = {
  id: number;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_bot: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type TelegramUserDto = {
  id: number;
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  isBot: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramUserInput = {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  isBot?: boolean;
};

function toUserDto(row: UserRow): TelegramUserDto {
  return {
    id: row.id,
    telegramUserId: row.telegram_user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    languageCode: row.language_code,
    isBot: row.is_bot === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USER_COLUMNS =
  'id, telegram_user_id, username, first_name, last_name, language_code, is_bot, is_active, created_at, updated_at';

/** Called on every incoming update before any command logic runs, per the
 * webhook flow spec: get telegram user -> UPSERT telegram_users. */
export async function upsertTelegramUser(input: TelegramUserInput): Promise<TelegramUserDto> {
  const row = await d1First<UserRow>(
    `INSERT INTO telegram_users (telegram_user_id, username, first_name, last_name, language_code, is_bot)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(telegram_user_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       language_code = excluded.language_code,
       is_bot = excluded.is_bot,
       updated_at = CURRENT_TIMESTAMP
     RETURNING ${USER_COLUMNS}`,
    input.telegramUserId,
    input.username ?? null,
    input.firstName ?? null,
    input.lastName ?? null,
    input.languageCode ?? null,
    input.isBot ? 1 : 0
  );
  return toUserDto(row!);
}

/** Admin "Аудиторія" tab — every user who has ever messaged the bot. */
export async function listTelegramUsers(): Promise<TelegramUserDto[]> {
  const rows = await d1All<UserRow>(`SELECT ${USER_COLUMNS} FROM telegram_users ORDER BY created_at DESC`);
  return rows.map(toUserDto);
}

type ChatRow = {
  id: number;
  telegram_chat_id: number;
  chat_type: string;
  title: string | null;
  username: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type TelegramChatDto = {
  id: number;
  telegramChatId: number;
  chatType: string;
  title: string | null;
  username: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramChatInput = {
  telegramChatId: number;
  chatType: string;
  title?: string | null;
  username?: string | null;
};

function toChatDto(row: ChatRow): TelegramChatDto {
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    chatType: row.chat_type,
    title: row.title,
    username: row.username,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CHAT_COLUMNS = 'id, telegram_chat_id, chat_type, title, username, is_active, created_at, updated_at';

/** Called right after upsertTelegramUser, per the webhook flow spec: get
 * chat -> UPSERT telegram_chats. */
export async function upsertTelegramChat(input: TelegramChatInput): Promise<TelegramChatDto> {
  const row = await d1First<ChatRow>(
    `INSERT INTO telegram_chats (telegram_chat_id, chat_type, title, username)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(telegram_chat_id) DO UPDATE SET
       chat_type = excluded.chat_type,
       title = excluded.title,
       username = excluded.username,
       updated_at = CURRENT_TIMESTAMP
     RETURNING ${CHAT_COLUMNS}`,
    input.telegramChatId,
    input.chatType,
    input.title ?? null,
    input.username ?? null
  );
  return toChatDto(row!);
}

/** Admin "Аудиторія" tab — every chat that has ever messaged the bot
 * (private DMs; the resolved channel chat — see lib/telegram/channel.ts —
 * also lands here once resolved, `chatType: 'channel'`). */
export async function listTelegramChats(): Promise<TelegramChatDto[]> {
  const rows = await d1All<ChatRow>(`SELECT ${CHAT_COLUMNS} FROM telegram_chats ORDER BY created_at DESC`);
  return rows.map(toChatDto);
}

export type TelegramStats = {
  userCount: number;
  chatCount: number;
  /** MAX(updated_at) across both tables — every upsert touches this column
   * on every webhook interaction, so it doubles as "last bot activity"
   * without a dedicated activity-log table. Null when nothing has happened
   * yet. */
  lastActivityAt: string | null;
};

/** Admin Dashboard tab. */
export async function getTelegramStats(): Promise<TelegramStats> {
  const row = await d1First<{ user_count: number; chat_count: number; last_activity_at: string | null }>(
    `SELECT
       (SELECT COUNT(*) FROM telegram_users) AS user_count,
       (SELECT COUNT(*) FROM telegram_chats) AS chat_count,
       (SELECT MAX(activity) FROM (
          SELECT MAX(updated_at) AS activity FROM telegram_users
          UNION ALL
          SELECT MAX(updated_at) AS activity FROM telegram_chats
       )) AS last_activity_at`
  );
  return {
    userCount: row?.user_count ?? 0,
    chatCount: row?.chat_count ?? 0,
    lastActivityAt: row?.last_activity_at ?? null,
  };
}

// ── telegram_posts ─────────────────────────────────────────────────────────

export type TelegramPostStatus = 'draft' | 'scheduled' | 'sent' | 'failed';

export type PostRow = {
  id: number;
  telegram_chat_id: number;
  source_type: string | null;
  source_id: string | null;
  text: string | null;
  media_url: string | null;
  telegram_message_id: number | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  content_type: string | null;
  publish_date: string | null;
  image_error: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramPostDto = {
  id: number;
  telegramChatId: number | null;
  sourceType: string | null;
  sourceId: string | null;
  text: string | null;
  mediaUrl: string | null;
  telegramMessageId: number | null;
  status: TelegramPostStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  /** Set only for autopost-claimed rows (migration 0008) — null for
   * manually-composed posts. See lib/telegram/autopost.ts. */
  contentType: string | null;
  publishDate: string | null;
  /** Non-fatal AI image generation/R2 upload failure reason (migration
   * 0009) -- independent of errorMessage, which is about the Telegram
   * publish step. Null means either not attempted or mediaUrl is already
   * set (succeeded). See lib/telegram/autopost-image.ts. */
  imageError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramPostCreateInput = {
  text?: string | null;
  mediaUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  scheduledAt?: string | null;
};

export type TelegramPostUpdateInput = Partial<TelegramPostCreateInput>;

function toPostStatus(value: string): TelegramPostStatus {
  return value === 'scheduled' || value === 'sent' || value === 'failed' ? value : 'draft';
}

export function toPostDto(row: PostRow): TelegramPostDto {
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    text: row.text,
    mediaUrl: row.media_url,
    telegramMessageId: row.telegram_message_id,
    status: toPostStatus(row.status),
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    errorMessage: row.error_message,
    contentType: row.content_type,
    publishDate: row.publish_date,
    imageError: row.image_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const POST_COLUMNS =
  'id, telegram_chat_id, source_type, source_id, text, media_url, telegram_message_id, status, scheduled_at, sent_at, error_message, content_type, publish_date, image_error, created_at, updated_at';

/** Admin "Публікації" tab — full history, newest first. */
export async function listTelegramPosts(): Promise<TelegramPostDto[]> {
  const rows = await d1All<PostRow>(`SELECT ${POST_COLUMNS} FROM telegram_posts ORDER BY created_at DESC`);
  return rows.map(toPostDto);
}

export async function getTelegramPost(id: number): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(`SELECT ${POST_COLUMNS} FROM telegram_posts WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}

/** Always created against the resolved channel chat — this stage never
 * targets an individual telegram_users/telegram_chats DM. `channelChatId`
 * comes from lib/telegram/channel.ts's getOrResolveChannelChat(). */
export async function createTelegramPost(
  channelChatId: number,
  input: TelegramPostCreateInput
): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `INSERT INTO telegram_posts (telegram_chat_id, source_type, source_id, text, media_url, status, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING ${POST_COLUMNS}`,
    channelChatId,
    input.sourceType ?? null,
    input.sourceId ?? null,
    input.text ?? null,
    input.mediaUrl ?? null,
    input.scheduledAt ? 'scheduled' : 'draft',
    input.scheduledAt ?? null
  );
  return toPostDto(row!);
}

/** Editing a post that has already been sent would silently rewrite
 * history for something Telegram already delivered — rejected with the
 * same conflict shape church_orders.rs's `conflict_or_db_error` uses for a
 * similar "can't touch this anymore" case. */
export async function updateTelegramPost(id: number, input: TelegramPostUpdateInput): Promise<TelegramPostDto> {
  const current = await getTelegramPost(id);
  if (current.status === 'sent') {
    throw ApiError.conflict('telegram post has already been sent and can no longer be edited');
  }

  const text = input.text !== undefined ? input.text : current.text;
  const mediaUrl = input.mediaUrl !== undefined ? input.mediaUrl : current.mediaUrl;
  const scheduledAt = input.scheduledAt !== undefined ? input.scheduledAt : current.scheduledAt;
  const status: TelegramPostStatus = scheduledAt ? 'scheduled' : 'draft';

  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET
       text = ?, media_url = ?, scheduled_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING ${POST_COLUMNS}`,
    text,
    mediaUrl,
    scheduledAt,
    status,
    id
  );
  return toPostDto(row!);
}

/** Called by the publish route after a successful sendMessage/sendPhoto. */
export async function markTelegramPostSent(id: number, telegramMessageId: number): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET
       status = 'sent', telegram_message_id = ?, sent_at = CURRENT_TIMESTAMP, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING ${POST_COLUMNS}`,
    telegramMessageId,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}

/** Called by the publish route when the Telegram API call itself fails
 * (network error, bot not an admin of the channel, etc.) — status becomes
 * 'failed' rather than silently staying 'draft', so the Публікації history
 * shows it was actually attempted. */
export async function markTelegramPostFailed(id: number, errorMessage: string): Promise<TelegramPostDto> {
  const row = await d1First<PostRow>(
    `UPDATE telegram_posts SET
       status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING ${POST_COLUMNS}`,
    errorMessage,
    id
  );
  if (!row) throw ApiError.notFound('telegram post not found');
  return toPostDto(row);
}

export type DeliveryLogInput = {
  telegramPostId: number;
  telegramChatId: number;
  telegramMessageId: number | null;
  status: 'success' | 'failed';
  errorMessage?: string | null;
};

/** Best-effort audit trail for every publish attempt (manual or autopost) —
 * a failure to write this must never mask the actual publish outcome, so
 * callers should treat this as fire-and-forget rather than propagating a
 * write error from here. */
export async function recordDeliveryLog(input: DeliveryLogInput): Promise<void> {
  await d1Run(
    `INSERT INTO telegram_delivery_logs (telegram_post_id, telegram_chat_id, telegram_message_id, status, error_message)
     VALUES (?, ?, ?, ?, ?)`,
    input.telegramPostId,
    input.telegramChatId,
    input.telegramMessageId,
    input.status,
    input.errorMessage ?? null
  );
}
