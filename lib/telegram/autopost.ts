import { checkUkrainianLanguage, describeLanguageGuardFailure } from '@/lib/ai/language-guard';
import { markTelegramPostFailed, markTelegramPostSent, recordDeliveryLog } from '@/lib/d1/repositories/telegram';
import {
  claimAutopostSlot,
  claimPromoBroadcastSlot,
  claimReadyAutopostSlot,
  getAutopostSettings,
  getPromoBroadcastSettings,
  setAutopostDraftText,
  setAutopostVerificationResult,
  type AutopostContentType,
} from '@/lib/d1/repositories/telegram-autopost';
import { generateTelegramPost, OpenAiError } from '@/lib/ai/openai';
import { loadAutopostFacts } from './autopost-content';
import { ensureAutopostImage } from './autopost-image';
import { getOrResolveChannelChat } from './channel';
import { TelegramApiError, TelegramClient } from './client';
import {
  buildSaintOfDayTitle,
  CONTENT_TYPE_FORMAT_HINTS,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_TARGET_LENGTH,
  CONTENT_TYPE_TITLES,
  PROMO_BROADCAST_BUTTON_LABEL,
  PROMO_BROADCAST_BUTTON_URL,
  PROMO_BROADCAST_TEXT,
} from './content-format';
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

/** Exported for lib/telegram/source-coverage.ts's read-only preview report,
 * so it derives "civil day in Europe/Kyiv" the exact same way the real
 * tick does rather than a second, potentially-drifting implementation. */
export function kyivDateIso(date: Date): string {
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
 * triggers.crons), so in principle one fire lands exactly on the scheduled
 * minute. But a single missed/failed tick (a transient fetch error between
 * the two Workers, a cold start, Cloudflare cron jitter) must not cost the
 * slot for the whole day -- the next tick 5 minutes later has to still
 * catch it. 15 minutes gives three tick cycles of headroom (one on-time
 * fire plus two retries) before a slot is given up on for today. This
 * can never bleed into *yesterday's* slot, regardless of how wide this is:
 * `civilDateIso` in runAutopostTick() below is always "today" in
 * Europe/Kyiv, so a slot that's still unclaimed once its window closes
 * simply stays unpublished for that day -- see the claim's
 * (publish_date, content_type) uniqueness in telegram-autopost.ts. */
const DUE_WINDOW_MINUTES = 15;

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
  /** Set only when the daily "visit the site" CTA broadcast was actually
   * due this tick (see PROMO_BROADCAST_* in content-format.ts) -- omitted,
   * not a "skipped" entry, when it wasn't due or is disabled, mirroring
   * how `attempted` above only ever lists types that were actually due. */
  promoBroadcast?: { outcome: 'sent' | 'failed' };
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

  // Read separately from `settings` above (see getPromoBroadcastSettings's
  // own doc comment) -- checked here, before the early return below, so a
  // tick where ONLY the promo broadcast is due (none of the 5 content
  // types) doesn't return before ever reaching it.
  const promoBroadcastSettings = await getPromoBroadcastSettings();
  const promoBroadcastDue = !!promoBroadcastSettings?.enabled && isDue(nowHhMm, promoBroadcastSettings.scheduleTime);

  if (dueTypes.length === 0 && !promoBroadcastDue) {
    return { ranAt: now.toISOString(), globalEnabled: true, attempted };
  }

  const client = new TelegramClient(telegramConfig.botToken);
  const channelChat = await getOrResolveChannelChat(client, telegramConfig.channel);

  for (const item of dueTypes) {
    const { contentType } = item;

    // Content Plan Stage 2's fast path: an admin may have already
    // generated/edited and explicitly confirmed ("Позначити готовим") this
    // exact slot ahead of time. claimReadyAutopostSlot() atomically
    // transitions that one row from 'ready' to 'sending' -- only one
    // caller can ever win it, so a second overlapping tick or a manual
    // retry hitting the same slot at the same moment can't also send it.
    // No OpenAI call, no image generation, no re-verification: the stored
    // text/media and the verification already recorded at "mark ready"
    // time are trusted, with only the same final validateBeforeSend() gate
    // every other send path already goes through. See
    // lib/d1/repositories/telegram-autopost.ts and
    // lib/telegram/content-plan-actions.ts.
    const readyRow = await claimReadyAutopostSlot(contentType, civilDateIso);
    if (readyRow) {
      try {
        const preSendCheck = validateBeforeSend({
          contentType,
          verificationStatus: readyRow.verificationStatus,
          text: readyRow.text,
        });
        if (!preSendCheck.ok) {
          throw new Error(`Pre-send validation failed: ${preSendCheck.reason}`);
        }

        const { textMessageId, photoMessageId, audioMessageId } = await sendAutopostMessage({
          client,
          chatId: channelChat.telegramChatId,
          postId: readyRow.id,
          text: readyRow.text ?? '',
          mediaUrl: readyRow.mediaUrl,
          audioUrl: readyRow.audioUrl,
          existingPhotoMessageId: readyRow.telegramPhotoMessageId,
          existingAudioMessageId: readyRow.telegramAudioMessageId,
          contentType,
        });
        await markTelegramPostSent(readyRow.id, textMessageId, photoMessageId, audioMessageId);
        await recordDeliveryLog({
          telegramPostId: readyRow.id,
          telegramChatId: channelChat.telegramChatId,
          telegramMessageId: textMessageId,
          status: 'success',
        });
        attempted.push({ contentType, outcome: 'sent' });
      } catch (error) {
        const message = errorMessage(error);
        await markTelegramPostFailed(readyRow.id, message);
        await recordDeliveryLog({
          telegramPostId: readyRow.id,
          telegramChatId: channelChat.telegramChatId,
          telegramMessageId: null,
          status: 'failed',
          errorMessage: message,
        });
        attempted.push({ contentType, outcome: 'failed' });
      }
      continue;
    }

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
        titleLine:
          contentType === 'saint_of_day'
            ? buildSaintOfDayTitle(facts.candidateName ?? '', civilDateIso, julianDateIso)
            : CONTENT_TYPE_TITLES[contentType],
        titleFlexible: contentType === 'faith_story',
      });

      // Checked BEFORE the text is ever persisted -- a language leak (task:
      // "Найден production content-quality bug", real incident
      // telegram_posts.id=19) must never reach the row at all here, not
      // just be caught later by validateBeforeSend's own backstop check
      // below. Throwing here falls into this block's own catch, which
      // already marks the post 'failed' and logs it, same as every other
      // failure in this tick.
      const languageCheck = checkUkrainianLanguage(text);
      if (!languageCheck.ok) {
        throw new Error(describeLanguageGuardFailure(languageCheck));
      }

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
        verifiedImageUrl: facts.verifiedImageUrl,
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

      // No audio here -- this is the full auto-generation path (no admin
      // preparation happened for this slot), and audio is manual-only,
      // never AI-generated (see media-limits.ts / assignSlotAudio).
      const { textMessageId, photoMessageId } = await sendAutopostMessage({
        client,
        chatId: channelChat.telegramChatId,
        postId: claimed.id,
        text,
        mediaUrl,
        audioUrl: null,
        existingPhotoMessageId: null,
        existingAudioMessageId: null,
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

  let promoBroadcast: AutopostTickResult['promoBroadcast'];
  if (promoBroadcastDue) {
    const claimed = await claimPromoBroadcastSlot(channelChat.telegramChatId, civilDateIso, PROMO_BROADCAST_TEXT);
    // null means today's slot is already claimed (a previous tick within
    // the same DUE_WINDOW_MINUTES already sent it, or is mid-send) -- not
    // an error, just nothing new to do this tick.
    if (claimed) {
      try {
        const { messageId } = await client.sendMessage(channelChat.telegramChatId, PROMO_BROADCAST_TEXT, {
          inline_keyboard: [[{ text: PROMO_BROADCAST_BUTTON_LABEL, url: PROMO_BROADCAST_BUTTON_URL }]],
        });
        await markTelegramPostSent(claimed.id, messageId);
        await recordDeliveryLog({
          telegramPostId: claimed.id,
          telegramChatId: channelChat.telegramChatId,
          telegramMessageId: messageId,
          status: 'success',
        });
        promoBroadcast = { outcome: 'sent' };
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
        promoBroadcast = { outcome: 'failed' };
      }
    }
  }

  return { ranAt: now.toISOString(), globalEnabled: true, attempted, promoBroadcast };
}
