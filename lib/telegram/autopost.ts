import { markTelegramPostFailed, markTelegramPostSent, recordDeliveryLog } from '@/lib/d1/repositories/telegram';
import {
  claimAutopostSlot,
  getAutopostSettings,
  setAutopostDraftText,
  setAutopostVerificationResult,
  type AutopostContentType,
} from '@/lib/d1/repositories/telegram-autopost';
import { generateTelegramPost, OpenAiError } from '@/lib/ai/openai';
import { loadAutopostFacts } from './autopost-content';
import { ensureAutopostImage } from './autopost-image';
import { getOrResolveChannelChat } from './channel';
import { TelegramApiError, TelegramClient } from './client';
import { CONTENT_TYPE_FORMAT_HINTS, CONTENT_TYPE_LABELS, CONTENT_TYPE_TARGET_LENGTH } from './content-format';
import { sendAutopostMessage } from './deliver-post';
import { getOpenAiConfig, getTelegramConfig } from './env';
import { getJulianCalendarDate } from './julian-calendar';
import { verifySaintOfDay } from './orthodox-calendar-verifier';
import { requiresCalendarVerification, validateBeforeSend } from './pre-send-validator';

/** The autonomous pipeline: Cloudflare Cron (via the standalone cron/
 * pinger Worker) → this → D1 church data → OpenAI → telegram_posts →
 * Telegram Bot API → @svit_ikony. Entry point is runAutopostTick(), called
 * by app/api/internal/telegram/autopost/tick/route.ts on every pinger fire
 * (every 5 minutes) — everything here decides on its own whether there is
 * actually anything due, so an extra or slightly-late fire is harmless.
 *
 * Calendar policy: the church content this pipeline sources is always
 * looked up by the Orthodox Julian ('old style') calendar date, never the
 * civil Gregorian one -- see julian-calendar.ts and autopost-content.ts.
 * `publishDate` on the resulting telegram_posts row stays the civil
 * Europe/Kyiv date, so Telegram history reflects the real day it was sent;
 * only the *source lookup* uses the Julian date. */

export { CONTENT_TYPE_LABELS };

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

export type AutopostOutcome =
  | 'sent'
  | 'failed'
  | 'skipped_insufficient_data'
  | 'skipped_already_claimed'
  | 'skipped_missing_source'
  | 'skipped_verification_failed';

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

  const civilDateIso = kyivDateIso(now);
  const julianDateIso = getJulianCalendarDate(now, 'Europe/Kyiv');
  const nowHhMm = kyivHhMm(now);
  const dueTypes = settings.items.filter((item) => item.enabled && isDue(nowHhMm, item.scheduleTime));
  if (dueTypes.length === 0) {
    return { ranAt: now.toISOString(), globalEnabled: true, attempted };
  }

  const client = new TelegramClient(telegramConfig.botToken);
  const channelChat = await getOrResolveChannelChat(client, telegramConfig.channel);

  for (const item of dueTypes) {
    const { contentType } = item;

    const factsResult = await loadAutopostFacts(contentType, julianDateIso);
    if (factsResult.status === 'missing_source') {
      attempted.push({ contentType, outcome: 'skipped_missing_source' });
      continue;
    }
    if (factsResult.status === 'insufficient_data') {
      attempted.push({ contentType, outcome: 'skipped_insufficient_data' });
      continue;
    }
    const { facts } = factsResult;

    const claimed = await claimAutopostSlot({
      contentType,
      publishDate: civilDateIso,
      channelChatId: channelChat.telegramChatId,
      sourceType: facts.sourceType,
      sourceId: facts.sourceId,
    });
    if (!claimed) {
      attempted.push({ contentType, outcome: 'skipped_already_claimed' });
      continue;
    }

    // Mandatory for content types that assert a specific saint/
    // commemoration ("Сьогодні Церква вшановує...") -- D1 alone is never
    // sufficient (see orthodox-calendar-verifier.ts's own doc comment for
    // the real incident that made this mandatory). Runs *after* the claim
    // (so the failure is recorded and visible, not a silent skip) but
    // *before* OpenAI/image/Telegram are ever touched.
    let verifiedFacts = false;
    if (requiresCalendarVerification(contentType)) {
      const verification = await verifySaintOfDay({
        civilDateIso,
        julianDateIso,
        candidateName: facts.candidateName ?? '',
      });
      const checkedAt = new Date().toISOString();
      if (!verification.verified) {
        await setAutopostVerificationResult(claimed.id, {
          status: 'failed',
          checkedAt,
          sources: verification.sources,
          error: verification.reason,
        });
        await markTelegramPostFailed(claimed.id, `Calendar verification failed: ${verification.reason}`);
        attempted.push({ contentType, outcome: 'skipped_verification_failed' });
        continue;
      }
      await setAutopostVerificationResult(claimed.id, {
        status: 'verified',
        checkedAt,
        sources: verification.sources,
        error: null,
      });
      verifiedFacts = true;
    }

    try {
      const targetLength = CONTENT_TYPE_TARGET_LENGTH[contentType];
      const text = await generateTelegramPost({
        apiKey: openAiConfig.apiKey,
        model: openAiConfig.model,
        contentTypeLabel: CONTENT_TYPE_LABELS[contentType],
        formatHint: CONTENT_TYPE_FORMAT_HINTS[contentType],
        targetLengthMin: targetLength.min,
        targetLengthMax: targetLength.max,
        facts: facts.facts,
        civilDateIso,
        julianDateIso,
        verifiedFacts,
      });
      // Persisted before the Telegram call so a send failure still leaves
      // the generated text on the row for a manual edit/retry, instead of
      // an empty 'failed' post nobody can do anything with.
      await setAutopostDraftText(claimed.id, text);

      // Best-effort: a failure here is recorded (telegram_posts.image_error)
      // and returns null, never throws -- the post still publishes as
      // text-only rather than being blocked on the image. See
      // lib/telegram/autopost-image.ts.
      const mediaUrl = await ensureAutopostImage({
        postId: claimed.id,
        existingMediaUrl: null,
        contentType,
        apiKey: openAiConfig.apiKey,
        imageModel: openAiConfig.imageModel,
      });

      // Final gate, independent of the verification step above -- refuses
      // to send if the row's own state doesn't actually satisfy
      // "verified" for a content type that requires it, regardless of how
      // it got here. See pre-send-validator.ts.
      const preSendCheck = validateBeforeSend({
        contentType,
        verificationStatus: verifiedFacts ? 'verified' : null,
        text,
      });
      if (!preSendCheck.ok) {
        throw new Error(`Pre-send validation failed: ${preSendCheck.reason}`);
      }

      const { textMessageId, photoMessageId } = await sendAutopostMessage({
        client,
        chatId: channelChat.telegramChatId,
        postId: claimed.id,
        text,
        mediaUrl,
        existingPhotoMessageId: null,
        contentType,
      });
      await markTelegramPostSent(claimed.id, textMessageId, photoMessageId);
      await recordDeliveryLog({
        telegramPostId: claimed.id,
        telegramChatId: channelChat.telegramChatId,
        telegramMessageId: textMessageId,
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
