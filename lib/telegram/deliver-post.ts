/**
 * Decides HOW an autopost row gets delivered to Telegram, and actually
 * sends it -- used by both the tick orchestrator (autopost.ts) and the
 * admin publish/retry route so the two never disagree. The AI text is
 * never truncated to fit a photo caption (see requirement this replaced,
 * which silently cut long posts): a caption that fits goes out as
 * sendPhoto's own caption; one that doesn't goes out as a photo message
 * carrying a short, programmatically-assembled caption (see
 * CONTENT_TYPE_LINKED_CAPTIONS -- never a second OpenAI call) immediately
 * followed by the full, untruncated text as a separate message. Both
 * calls belong to the SAME telegram_posts row -- duplicate protection
 * still keys on (publish_date, content_type), never on message count.
 */
import { isAutopostContentType } from '@/lib/d1/repositories/telegram-autopost';
import { setTelegramPostPhotoMessageId } from '@/lib/d1/repositories/telegram';
import type { TelegramClient } from './client';
import { CONTENT_TYPE_LINKED_CAPTIONS } from './content-format';

/** Telegram's hard photo-caption limit is 1024 UTF-16 code units --
 * comfortably below it so real-world encoding overhead never tips a
 * "fits" decision into a rejected sendPhoto call. */
export const SAFE_CAPTION_LIMIT = 1000;

export type DeliveryPlan =
  | { kind: 'text_only' }
  | { kind: 'photo_with_caption' }
  | { kind: 'photo_then_text' };

export function planDelivery(text: string, mediaUrl: string | null): DeliveryPlan {
  if (!mediaUrl) return { kind: 'text_only' };
  if (text.length <= SAFE_CAPTION_LIMIT) return { kind: 'photo_with_caption' };
  return { kind: 'photo_then_text' };
}

/** The photo_then_text photo's caption -- a fixed, per-type string (never
 * AI-generated), so the photo reads as visually part of the post that
 * immediately follows rather than a detached image. Falls back to no
 * caption for a manually-composed post (contentType null) or any type not
 * in the map, preserving the previous behavior for that case. */
function linkedCaptionFor(contentType: string | null): string | undefined {
  if (contentType && isAutopostContentType(contentType)) return CONTENT_TYPE_LINKED_CAPTIONS[contentType];
  return undefined;
}

export type SendAutopostMessageInput = {
  client: TelegramClient;
  chatId: number | string;
  postId: number;
  text: string;
  mediaUrl: string | null;
  /** Already-recorded photo message id from an earlier attempt (retry) --
   * when set, the photo is never re-sent, only the text half is
   * (re)attempted. See setTelegramPostPhotoMessageId's own doc comment. */
  existingPhotoMessageId: number | null;
  /** Selects the photo_then_text case's linked caption (see
   * linkedCaptionFor above) -- null for a manually-composed post. */
  contentType: string | null;
};

export type SendAutopostMessageResult = {
  textMessageId: number;
  photoMessageId: number | null;
};

/**
 * The one place that actually performs an autopost delivery -- used by
 * both the tick orchestrator and the admin publish/retry route so their
 * behavior can never diverge. Persists a newly-sent photo's message id
 * immediately (before attempting the text half), so a failure on the text
 * call still leaves a durable record that the photo went out and a
 * subsequent retry won't post it a second time.
 */
export async function sendAutopostMessage(input: SendAutopostMessageInput): Promise<SendAutopostMessageResult> {
  const plan: DeliveryPlan = input.existingPhotoMessageId ? { kind: 'photo_then_text' } : planDelivery(input.text, input.mediaUrl);

  if (plan.kind === 'text_only') {
    const { messageId } = await input.client.sendMessage(input.chatId, input.text);
    return { textMessageId: messageId, photoMessageId: null };
  }

  if (plan.kind === 'photo_with_caption') {
    const { messageId } = await input.client.sendPhoto(input.chatId, input.mediaUrl as string, input.text);
    return { textMessageId: messageId, photoMessageId: null };
  }

  let photoMessageId = input.existingPhotoMessageId;
  if (!photoMessageId) {
    const photoResult = await input.client.sendPhoto(input.chatId, input.mediaUrl as string, linkedCaptionFor(input.contentType));
    photoMessageId = photoResult.messageId;
    await setTelegramPostPhotoMessageId(input.postId, photoMessageId);
  }
  const { messageId: textMessageId } = await input.client.sendMessage(input.chatId, input.text);
  return { textMessageId, photoMessageId };
}
