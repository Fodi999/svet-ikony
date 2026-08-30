import { listTelegramChats, upsertTelegramChat, type TelegramChatDto } from '@/lib/d1/repositories/telegram';
import type { TelegramClient } from './client';

/**
 * The `@svit_ikony` channel never sends `/start`, so it never lands in
 * telegram_chats via the normal webhook upsert path the way a user's DM
 * does. Resolved once via Telegram's getChat (which accepts a public
 * `@username` directly, no numeric id needed up front), then cached as a
 * `chat_type = 'channel'` row in telegram_chats so every later publish
 * reuses the same numeric id instead of re-resolving.
 */
export async function getOrResolveChannelChat(client: TelegramClient, channelUsername: string): Promise<TelegramChatDto> {
  const chats = await listTelegramChats();
  const existing = chats.find((chat) => chat.chatType === 'channel');
  if (existing) return existing;

  const chat = await client.getChat(channelUsername);
  return upsertTelegramChat({
    telegramChatId: chat.id,
    chatType: 'channel',
    title: chat.title ?? null,
    username: chat.username ?? null,
  });
}
