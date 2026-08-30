import { upsertTelegramChat, upsertTelegramUser } from '@/lib/d1/repositories/telegram';
import { commandFromCallbackData, HELP_TEXT, parseSlashCommand, SETTINGS_STUB_TEXT, START_TEXT } from '@/lib/telegram/commands';
import type { Command } from '@/lib/telegram/commands';
import { fetchGospelText, fetchPrayerText, fetchSaintText, fetchTodayText } from '@/lib/telegram/content';
import { TelegramClient } from '@/lib/telegram/client';
import { getTelegramConfig } from '@/lib/telegram/env';
import { mainMenuKeyboard } from '@/lib/telegram/keyboards';

/** POST /api/telegram/webhook — mirrors
 * assistant/src/interfaces/telegram/webhook.rs's telegram_webhook_handler.
 * Every request is checked against TELEGRAM_WEBHOOK_SECRET (via
 * X-Telegram-Bot-Api-Secret-Token) before anything else happens. */

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
};

type TelegramMessage = {
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

function validateSecret(request: Request, expected: string | null): boolean {
  if (!expected) return false; // fail closed: unconfigured secret rejects everything
  const received = request.headers.get('x-telegram-bot-api-secret-token');
  return received === expected;
}

async function recordUserAndChat(from: TelegramUser | undefined, chat: TelegramChat): Promise<void> {
  if (from) {
    await upsertTelegramUser({
      telegramUserId: from.id,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      languageCode: from.language_code ?? null,
      isBot: from.is_bot ?? false,
    });
  }
  await upsertTelegramChat({
    telegramChatId: chat.id,
    chatType: chat.type,
    title: chat.title ?? null,
    username: chat.username ?? null,
  });
}

async function dispatchCommand(client: TelegramClient, chatId: number, command: Command): Promise<void> {
  switch (command) {
    case 'start':
      await client.sendMessage(chatId, START_TEXT, mainMenuKeyboard());
      return;
    case 'help':
      await client.sendMessage(chatId, HELP_TEXT);
      return;
    case 'today':
      await client.sendMessage(chatId, await fetchTodayText(), mainMenuKeyboard());
      return;
    case 'prayer':
      await client.sendMessage(chatId, await fetchPrayerText());
      return;
    case 'saint':
      await client.sendMessage(chatId, await fetchSaintText());
      return;
    case 'gospel':
      await client.sendMessage(chatId, await fetchGospelText());
      return;
  }
}

async function handleUpdate(client: TelegramClient, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    const callback = update.callback_query;
    // Acknowledge immediately so Telegram stops showing the loading spinner
    // on the button, regardless of whether `data` is recognized.
    await client.answerCallbackQuery(callback.id).catch((err) => console.warn('Telegram: answerCallbackQuery failed', err));

    const chatId = callback.message?.chat.id;
    if (chatId === undefined || !callback.data) return;

    await recordUserAndChat(callback.from, callback.message!.chat);

    const command = commandFromCallbackData(callback.data);
    if (command) {
      await dispatchCommand(client, chatId, command);
    } else if (callback.data === 'settings') {
      await client.sendMessage(chatId, SETTINGS_STUB_TEXT);
    }
    return;
  }

  if (update.message?.text) {
    const message = update.message;
    const command = parseSlashCommand(message.text!);
    if (!command) return; // free-text messages are intentionally ignored in this MVP

    await recordUserAndChat(message.from, message.chat);
    await dispatchCommand(client, message.chat.id, command);
  }
}

export async function POST(request: Request) {
  const config = await getTelegramConfig();
  if (!config) {
    return Response.json({ error: 'Telegram integration is not configured' }, { status: 503 });
  }

  if (!validateSecret(request, config.webhookSecret)) {
    return new Response(null, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch (err) {
    console.warn('Telegram webhook: failed to parse update body', err);
    return new Response(null, { status: 400 });
  }

  const client = new TelegramClient(config.botToken);
  try {
    await handleUpdate(client, update);
  } catch (err) {
    // Always 200 once the update is accepted, so Telegram doesn't retry —
    // any downstream failure is only logged.
    console.error('Telegram webhook: error handling update', err);
  }

  return new Response('OK', { status: 200 });
}
