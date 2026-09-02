import { generateTelegramPost, OpenAiError } from '@/lib/ai/openai';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import {
  getTelegramPost,
  markTelegramPostFailed,
  markTelegramPostSent,
  recordDeliveryLog,
  type TelegramPostDto,
} from '@/lib/d1/repositories/telegram';
import { isAutopostContentType, setAutopostDraftText } from '@/lib/d1/repositories/telegram-autopost';
import { loadAutopostFacts } from '@/lib/telegram/autopost-content';
import { ensureAutopostImage } from '@/lib/telegram/autopost-image';
import { getOrResolveChannelChat } from '@/lib/telegram/channel';
import { TelegramApiError, TelegramClient } from '@/lib/telegram/client';
import {
  buildSaintOfDayTitle,
  CONTENT_TYPE_FORMAT_HINTS,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_TARGET_LENGTH,
  CONTENT_TYPE_TITLES,
} from '@/lib/telegram/content-format';
import { sendAutopostMessage } from '@/lib/telegram/deliver-post';
import { getOpenAiConfig, getTelegramConfig } from '@/lib/telegram/env';
import { gregorianToJulianCalendarDate } from '@/lib/telegram/julian-calendar';
import { requiresCalendarVerification, validateBeforeSend } from '@/lib/telegram/pre-send-validator';

function parsePostId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw ApiError.validation('id must be an integer');
  return id;
}

/**
 * An autopost row (migration 0008) can reach 'failed' before OpenAI ever
 * produced any text (its own generation call threw) -- unlike a manually
 * composed post, resending `post.text` here would just resend nothing.
 * Regenerate from the same real D1 facts first, persisting via
 * setAutopostDraftText before returning, same crash-safety order as
 * lib/telegram/autopost.ts's own generate step.
 *
 * `post.publishDate` is always the CIVIL Europe/Kyiv date (see autopost.ts)
 * -- source facts are Julian-calendar-only, so it's converted here before
 * calling loadAutopostFacts, exactly mirroring the orchestrator's own
 * civil-date vs Julian-date split.
 */
async function regenerateAutopostTextIfMissing(post: TelegramPostDto): Promise<TelegramPostDto> {
  if (post.text || !post.contentType || !isAutopostContentType(post.contentType) || !post.publishDate) {
    return post;
  }

  // A content type requiring calendar verification (saint_of_day) can only
  // ever have empty text here because either verification itself failed
  // (verificationStatus: 'failed') or this row predates the feature
  // entirely (verificationStatus: null) -- fail closed either way. Retry
  // cannot bypass a failed/missing verification; the underlying D1 data
  // must be fixed and a fresh tick must claim and verify a new row.
  if (requiresCalendarVerification(post.contentType) && post.verificationStatus !== 'verified') {
    throw ApiError.validation(`Calendar verification is not passed for this post (status: ${post.verificationStatus ?? 'never checked'})`);
  }

  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) throw ApiError.validation('OpenAI is not configured');

  const civilDateIso = post.publishDate;
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const factsResult = await loadAutopostFacts(post.contentType, julianDateIso);
  if (factsResult.status !== 'ok') throw ApiError.validation('Source data for this post is no longer available');

  try {
    const targetLength = CONTENT_TYPE_TARGET_LENGTH[post.contentType];
    const text = await generateTelegramPost({
      apiKey: openAiConfig.apiKey,
      model: openAiConfig.model,
      contentTypeLabel: CONTENT_TYPE_LABELS[post.contentType],
      formatHint: CONTENT_TYPE_FORMAT_HINTS[post.contentType],
      targetLengthMin: targetLength.min,
      targetLengthMax: targetLength.max,
      facts: factsResult.facts.facts,
      civilDateIso,
      julianDateIso,
      titleLine:
        post.contentType === 'saint_of_day'
          ? buildSaintOfDayTitle(factsResult.facts.candidateName ?? '')
          : CONTENT_TYPE_TITLES[post.contentType],
      titleFlexible: post.contentType === 'faith_story',
    });
    return await setAutopostDraftText(post.id, text);
  } catch (error) {
    const message = error instanceof OpenAiError ? error.message : error instanceof Error ? error.message : 'unknown error';
    await markTelegramPostFailed(post.id, message);
    throw new ApiError(502, 'OPENAI_ERROR', 'Failed to generate post text', message);
  }
}

/**
 * Best-effort: an autopost row (contentType set) with no mediaUrl yet gets
 * one AI image generation attempt -- skipped entirely (not an error) when
 * OPENAI_API_KEY isn't configured, since the image is always optional. A
 * row that already has mediaUrl (from a prior successful attempt) is
 * returned unchanged -- see ensureAutopostImage's own "already saved"
 * skip, which is what actually enforces "retry must not regenerate an
 * already-saved image".
 *
 * For saint_of_day, re-derives the day's facts first so a retry gets the
 * same church_saints.imageUrl short-circuit as a fresh tick (see
 * autopost-content.ts's verifiedImageUrl and autopost-image.ts) instead of
 * always falling back to an AI-generated scene just because this is a
 * retry. That lookup is itself best-effort: any failure here still leaves
 * the AI-generation fallback available below rather than blocking the
 * retry.
 */
async function ensureAutopostImageIfMissing(post: TelegramPostDto): Promise<TelegramPostDto> {
  if (post.mediaUrl || !post.contentType || !isAutopostContentType(post.contentType)) {
    return post;
  }

  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) return post;

  let verifiedImageUrl: string | undefined;
  if (post.contentType === 'saint_of_day' && post.publishDate) {
    try {
      const factsResult = await loadAutopostFacts(post.contentType, gregorianToJulianCalendarDate(post.publishDate));
      if (factsResult.status === 'ok') verifiedImageUrl = factsResult.facts.verifiedImageUrl;
    } catch {
      // Best-effort lookup -- ensureAutopostImage below still falls back to
      // AI generation when this fails, exactly as if no verified asset existed.
    }
  }

  const mediaUrl = await ensureAutopostImage({
    postId: post.id,
    existingMediaUrl: null,
    contentType: post.contentType,
    apiKey: openAiConfig.apiKey,
    imageModel: openAiConfig.imageModel,
    verifiedImageUrl,
  });
  return mediaUrl ? { ...post, mediaUrl } : post;
}

/**
 * The double-publish guard: a post whose status is already 'sent' is
 * rejected with 409 *before* any Telegram call is attempted, so retrying a
 * timed-out request or double-clicking "Опублікувати" can never post the
 * same content to the channel twice. A Telegram-side failure (network
 * error, bot not an admin of the channel, ...) marks the post 'failed'
 * (still publishable again afterward) rather than leaving it stuck as
 * 'draft' with no record the attempt happened.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const postId = parsePostId(id);

    let post = await getTelegramPost(postId);
    if (post.status === 'sent' || post.status === 'sending') {
      // 'sending' is the short-lived state a Content Plan "ready" slot
      // occupies between the autopost tick's atomic claim
      // (claimReadyAutopostSlot) and its send completing -- blocking a
      // manual retry here too closes the only race that new state
      // introduces (a retry click landing mid-tick-send). See
      // lib/telegram/autopost.ts and lib/telegram/content-plan-actions.ts.
      throw ApiError.conflict('telegram post has already been sent or is currently being sent');
    }

    const config = await getTelegramConfig();
    if (!config) throw ApiError.validation('Telegram bot is not configured');

    post = await regenerateAutopostTextIfMissing(post);
    post = await ensureAutopostImageIfMissing(post);

    // Final gate before any Telegram call, independent of the checks
    // above -- refuses to send if the row's own stored state doesn't
    // actually satisfy "verified" for a content type that requires it,
    // regardless of how it got here (a stale pre-feature row, a future
    // bug upstream, ...). See pre-send-validator.ts.
    const preSendCheck = validateBeforeSend({
      contentType: post.contentType,
      verificationStatus: post.verificationStatus,
      text: post.text,
    });
    if (!preSendCheck.ok) {
      throw ApiError.validation(`Pre-send validation failed: ${preSendCheck.reason}`);
    }

    const client = new TelegramClient(config.botToken);
    const channelChat = await getOrResolveChannelChat(client, config.channel);

    try {
      const { textMessageId, photoMessageId } = await sendAutopostMessage({
        client,
        chatId: channelChat.telegramChatId,
        postId,
        text: post.text ?? '',
        mediaUrl: post.mediaUrl,
        existingPhotoMessageId: post.telegramPhotoMessageId,
        contentType: post.contentType,
      });
      const updated = await markTelegramPostSent(postId, textMessageId, photoMessageId);
      await recordDeliveryLog({
        telegramPostId: postId,
        telegramChatId: channelChat.telegramChatId,
        telegramMessageId: textMessageId,
        status: 'success',
      });
      return Response.json(updated);
    } catch (error) {
      const message =
        error instanceof TelegramApiError ? error.description : error instanceof Error ? error.message : 'unknown error';
      await markTelegramPostFailed(postId, message);
      await recordDeliveryLog({
        telegramPostId: postId,
        telegramChatId: channelChat.telegramChatId,
        telegramMessageId: null,
        status: 'failed',
        errorMessage: message,
      });
      throw new ApiError(502, 'TELEGRAM_ERROR', 'Failed to publish to Telegram', message);
    }
  });
}
