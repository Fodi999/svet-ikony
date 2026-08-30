import { d1First } from '../db';

/** telegram_users / telegram_chats — additive tables from
 * migrations/0007_telegram_bot.sql, isolated from the church_ and icon_
 * content schema. Only the two upserts the webhook needs on every update are
 * implemented here; telegram_subscriptions/telegram_posts/telegram_delivery_logs
 * exist as schema only for now (future broadcast feature, explicitly out of
 * scope for this stage). */

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
