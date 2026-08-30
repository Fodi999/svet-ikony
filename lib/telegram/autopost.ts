import { markTelegramPostFailed, markTelegramPostSent, recordDeliveryLog } from '@/lib/d1/repositories/telegram';
import {
  claimAutopostSlot,
  getAutopostSettings,
  setAutopostDraftText,
  type AutopostContentType,
} from '@/lib/d1/repositories/telegram-autopost';
import { generateTelegramPost, OpenAiError } from '@/lib/ai/openai';
import { loadAutopostFacts } from './autopost-content';
import { getOrResolveChannelChat } from './channel';
import { TelegramApiError, TelegramClient } from './client';
import { getOpenAiConfig, getTelegramConfig } from './env';

/** The autonomous pipeline: Cloudflare Cron (via the standalone cron/
 * pinger Worker) → this → D1 church data → OpenAI → telegram_posts →
 * Telegram Bot API → @svit_ikony. Entry point is runAutopostTick(), called
 * by app/api/internal/telegram/autopost/tick/route.ts on every pinger fire
 * (every 5 minutes) — everything here decides on its own whether there is
 * actually anything due, so an extra or slightly-late fire is harmless. */

const CONTENT_TYPE_LABELS: Record<AutopostContentType, string> = {
  morning_prayer: 'Ранкова молитва',
  saint_of_day: 'Святий дня',
  gospel: 'Євангеліє дня',
  faith_story: 'Історія віри',
  evening_prayer: 'Вечірня молитва',
};

function kyivDateIso(date: Date): string {
  // en-CA formats as YYYY-MM-DD, which happens to match SQLite's own date
  // string ordering — no separate parsing step needed.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function kyivHhMm(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function minutesSinceMidnight(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** The cron pinger fires on a 5-minute cadence (see cron/wrangler.jsonc's
 * triggers.crons); a slot counts as due from its scheduled minute up to
 * (but not including) 5 minutes after, so exactly one fire catches it even
 * if the pinger runs a little behind schedule. */
const DUE_WINDOW_MINUTES = 5;

function isDue(nowHhMm: string, scheduledHhMm: string): boolean {
  const diff = minutesSinceMidnight(nowHhMm) - minutesSinceMidnight(scheduledHhMm);
  return diff >= 0 && diff < DUE_WINDOW_MINUTES;
}

export type AutopostOutcome = 'sent' | 'failed' | 'skipped_insufficient_data' | 'skipped_already_claimed';

export type AutopostTickResult = {
  ranAt: string;
  globalEnabled: boolean;
  attempted: { contentType: AutopostContentType; outcome: AutopostOutcome }[];
};

function errorMessage(error: unknown): string {
  if (error instanceof OpenAiError) return error.message;
  if (error instanceof TelegramApiError) return error.description;
  if (error instanceof Error) return error.message;
  return 'unknown error';
}

export async function runAutopostTick(): Promise<AutopostTickResult> {
  const now = new Date();
  const attempted: AutopostTickResult['attempted'] = [];

  const settings = await getAutopostSettings();
  if (!settings.globalEnabled) {
    return { ranAt: now.toISOString(), globalEnabled: false, attempted };
  }

  const telegramConfig = await getTelegramConfig();
  const openAiConfig = await getOpenAiConfig();
  if (!telegramConfig || !openAiConfig) {
    // Autopost is "on" in settings but a required secret isn't configured —
    // skip silently rather than error every 5 minutes; getStatus() in the
    // admin Dashboard already surfaces `configured: false` for the bot half
    // of this, and settings still show `globalEnabled: true` so the gap is
    // visible there too.
    return { ranAt: now.toISOString(), globalEnabled: true, attempted };
  }

  const dateIso = kyivDateIso(now);
  const nowHhMm = kyivHhMm(now);
  const dueTypes = settings.items.filter((item) => item.enabled && isDue(nowHhMm, item.scheduleTime));
  if (dueTypes.length === 0) {
    return { ranAt: now.toISOString(), globalEnabled: true, attempted };
  }

  const client = new TelegramClient(telegramConfig.botToken);
  const channelChat = await getOrResolveChannelChat(client, telegramConfig.channel);

  for (const item of dueTypes) {
    const { contentType } = item;

    const facts = await loadAutopostFacts(contentType, dateIso);
    if (!facts) {
      attempted.push({ contentType, outcome: 'skipped_insufficient_data' });
      continue;
    }

    const claimed = await claimAutopostSlot({
      contentType,
      publishDate: dateIso,
      channelChatId: channelChat.telegramChatId,
      sourceType: facts.sourceType,
      sourceId: facts.sourceId,
    });
    if (!claimed) {
      attempted.push({ contentType, outcome: 'skipped_already_claimed' });
      continue;
    }

    try {
      const text = await generateTelegramPost({
        apiKey: openAiConfig.apiKey,
        model: openAiConfig.model,
        contentTypeLabel: CONTENT_TYPE_LABELS[contentType],
        facts: facts.facts,
      });
      // Persisted before the Telegram call so a send failure still leaves
      // the generated text on the row for a manual edit/retry, instead of
      // an empty 'failed' post nobody can do anything with.
      await setAutopostDraftText(claimed.id, text);

      const { messageId } = await client.sendMessage(channelChat.telegramChatId, text);
      await markTelegramPostSent(claimed.id, messageId);
      await recordDeliveryLog({
        telegramPostId: claimed.id,
        telegramChatId: channelChat.telegramChatId,
        telegramMessageId: messageId,
        status: 'success',
      });
      attempted.push({ contentType, outcome: 'sent' });
    } catch (error) {
      const message = errorMessage(error);
      await markTelegramPostFailed(claimed.id, message);
      await recordDeliveryLog({
        telegramPostId: claimed.id,
        telegramChatId: channelChat.telegramChatId,
        telegramMessageId: null,
        status: 'failed',
        errorMessage: message,
      });
      attempted.push({ contentType, outcome: 'failed' });
    }
  }

  return { ranAt: now.toISOString(), globalEnabled: true, attempted };
}
