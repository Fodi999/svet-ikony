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
import { CONTENT_TYPE_FORMAT_HINTS, CONTENT_TYPE_LABELS } from '@/lib/telegram/content-format';
import { getOpenAiConfig, getTelegramConfig } from '@/lib/telegram/env';
import { gregorianToJulianCalendarDate } from '@/lib/telegram/julian-calendar';

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

  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) throw ApiError.validation('OpenAI is not configured');

  const civilDateIso = post.publishDate;
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const factsResult = await loadAutopostFacts(post.contentType, julianDateIso);
  if (factsResult.status !== 'ok') throw ApiError.validation('Source data for this post is no longer available');

  try {
    const text = await generateTelegramPost({
      apiKey: openAiConfig.apiKey,
      model: openAiConfig.model,
      contentTypeLabel: CONTENT_TYPE_LABELS[post.contentType],
      formatHint: CONTENT_TYPE_FORMAT_HINTS[post.contentType],
      facts: factsResult.facts.facts,
      civilDateIso,
      julianDateIso,
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
 */
async function ensureAutopostImageIfMissing(post: TelegramPostDto): Promise<TelegramPostDto> {
  if (post.mediaUrl || !post.contentType || !isAutopostContentType(post.contentType)) {
    return post;
  }

  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) return post;

  const mediaUrl = await ensureAutopostImage({
    postId: post.id,
    existingMediaUrl: null,
    contentType: post.contentType,
    apiKey: openAiConfig.apiKey,
    imageModel: openAiConfig.imageModel,
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
    if (post.status === 'sent') {
      throw ApiError.conflict('telegram post has already been sent');
    }

    const config = await getTelegramConfig();
    if (!config) throw ApiError.validation('Telegram bot is not configured');

    post = await regenerateAutopostTextIfMissing(post);
    post = await ensureAutopostImageIfMissing(post);

    const client = new TelegramClient(config.botToken);
    const channelChat = await getOrResolveChannelChat(client, config.channel);

    try {
      const { messageId } = post.mediaUrl
        ? await client.sendPhoto(channelChat.telegramChatId, post.mediaUrl, post.text ?? undefined)
        : await client.sendMessage(channelChat.telegramChatId, post.text ?? '');
      const updated = await markTelegramPostSent(postId, messageId);
      await recordDeliveryLog({
        telegramPostId: postId,
        telegramChatId: channelChat.telegramChatId,
        telegramMessageId: messageId,
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
