/**
 * Decides HOW an autopost row gets delivered to Telegram, and actually
 * sends it -- used by both the tick orchestrator (autopost.ts) and the
 * admin publish/retry route so the two never disagree. The AI text is
 * never truncated to fit a photo caption (see requirement this replaced,
 * which silently cut long posts): a caption that fits goes out as
 * sendPhoto's own caption; one that doesn't goes out as a photo message
 * carrying a short, programmatically-assembled caption (see
 * CONTENT_TYPE_LINKED_CAPTIONS -- never a second OpenAI call) immediately
 * followed by the full, untruncated text as a separate message. All calls
 * for one delivery belong to the SAME telegram_posts row -- duplicate
 * protection still keys on (publish_date, content_type), never on message
 * count.
 *
 * Audio (manually assigned only, see content-plan-actions.ts's
 * assignSlotAudio -- never AI-generated) follows the same "own message,
 * short fixed caption, never inline with text" shape as a split photo:
 * Telegram has no single message type that carries both a photo and an
 * audio file, so any plan that includes audio is necessarily >=2 messages,
 * regardless of whether the text would have fit in a photo caption alone.
 */
import { isAutopostContentType } from '@/lib/d1/repositories/telegram-autopost';
import { setTelegramPostAudioMessageId, setTelegramPostPhotoMessageId } from '@/lib/d1/repositories/telegram';
import type { TelegramClient } from './client';
import { CONTENT_TYPE_AUDIO_CAPTIONS, CONTENT_TYPE_LINKED_CAPTIONS } from './content-format';

/** Telegram's hard photo/audio-caption limit is 1024 UTF-16 code units --
 * comfortably below it so real-world encoding overhead never tips a
 * "fits" decision into a rejected sendPhoto call. */
export const SAFE_CAPTION_LIMIT = 1000;

export type DeliveryPlan =
  | { kind: 'text_only' }
  | { kind: 'photo_with_caption' }
  | { kind: 'photo_then_text' }
  | { kind: 'audio_then_text' }
  | { kind: 'photo_and_audio_then_text' };

/**
 * `audioUrl` defaults to null so every existing call site (none of which
 * know about audio) keeps its exact previous behavior unchanged. Whenever
 * audio is present, the single-message `photo_with_caption` shortcut is
 * never available (no message type carries photo+audio+text together) --
 * text always goes out as its own message, independent of its length.
 */
export function planDelivery(text: string, mediaUrl: string | null, audioUrl: string | null = null): DeliveryPlan {
  if (mediaUrl && audioUrl) return { kind: 'photo_and_audio_then_text' };
  if (audioUrl) return { kind: 'audio_then_text' };
  if (!mediaUrl) return { kind: 'text_only' };
  if (text.length <= SAFE_CAPTION_LIMIT) return { kind: 'photo_with_caption' };
  return { kind: 'photo_then_text' };
}

/** The photo half's caption for any split plan that includes a photo -- a
 * fixed, per-type string (never AI-generated), so the photo reads as
 * visually part of the post that immediately follows rather than a
 * detached image. Falls back to no caption for a manually-composed post
 * (contentType null) or any type not in the map, preserving the previous
 * behavior for that case. */
function linkedCaptionFor(contentType: string | null): string | undefined {
  if (contentType && isAutopostContentType(contentType)) return CONTENT_TYPE_LINKED_CAPTIONS[contentType];
  return undefined;
}

/** Audio counterpart of linkedCaptionFor -- see CONTENT_TYPE_AUDIO_CAPTIONS's
 * own doc comment for why it's worded distinctly from the photo caption. */
function audioLinkedCaptionFor(contentType: string | null): string | undefined {
  if (contentType && isAutopostContentType(contentType)) return CONTENT_TYPE_AUDIO_CAPTIONS[contentType];
  return undefined;
}

export type SendAutopostMessageInput = {
  client: TelegramClient;
  chatId: number | string;
  postId: number;
  text: string;
  mediaUrl: string | null;
  audioUrl: string | null;
  /** Already-recorded photo message id from an earlier attempt (retry) --
   * when set, the photo is never re-sent, only the remaining part(s) are
   * (re)attempted. See setTelegramPostPhotoMessageId's own doc comment. */
  existingPhotoMessageId: number | null;
  /** Audio counterpart of existingPhotoMessageId -- see
   * setTelegramPostAudioMessageId. */
  existingAudioMessageId: number | null;
  /** Selects the per-type linked captions above -- null for a
   * manually-composed post. */
  contentType: string | null;
};

export type SendAutopostMessageResult = {
  textMessageId: number;
  photoMessageId: number | null;
  audioMessageId: number | null;
};

/** A retry (existingPhotoMessageId or existingAudioMessageId already set)
 * must resolve to the same split shape the original attempt used --
 * mediaUrl/audioUrl don't change between attempts (assignment happens
 * before a slot is marked ready/sent), so which of the two was present is
 * sufficient to reconstruct it without re-running planDelivery's own
 * length-based branching, which is irrelevant once any split is already
 * underway. */
function retryPlanKind(mediaUrl: string | null, audioUrl: string | null): DeliveryPlan['kind'] {
  if (mediaUrl && audioUrl) return 'photo_and_audio_then_text';
  if (audioUrl) return 'audio_then_text';
  return 'photo_then_text';
}

/**
 * The one place that actually performs an autopost delivery -- used by
 * both the tick orchestrator and the admin publish/retry route so their
 * behavior can never diverge. Persists each newly-sent photo/audio
 * message id immediately (before attempting the next part), so a failure
 * partway through a multi-message plan still leaves a durable record of
 * which parts already went out -- a subsequent retry re-sends only what's
 * still missing, never a part that already succeeded (idempotent per
 * part, keyed on these two columns, independent of one another).
 */
export async function sendAutopostMessage(input: SendAutopostMessageInput): Promise<SendAutopostMessageResult> {
  const plan: DeliveryPlan =
    input.existingPhotoMessageId || input.existingAudioMessageId
      ? { kind: retryPlanKind(input.mediaUrl, input.audioUrl) }
      : planDelivery(input.text, input.mediaUrl, input.audioUrl);

  if (plan.kind === 'text_only') {
    const { messageId } = await input.client.sendMessage(input.chatId, input.text);
    return { textMessageId: messageId, photoMessageId: null, audioMessageId: null };
  }

  if (plan.kind === 'photo_with_caption') {
    const { messageId } = await input.client.sendPhoto(input.chatId, input.mediaUrl as string, input.text);
    return { textMessageId: messageId, photoMessageId: null, audioMessageId: null };
  }

  // `?? null` normalizes an absent field to null rather than undefined --
  // TelegramPostDto's real fields are always explicitly null, never
  // undefined, but this guards the same for any caller that isn't.
  let photoMessageId = input.existingPhotoMessageId ?? null;
  let audioMessageId = input.existingAudioMessageId ?? null;

  if (plan.kind === 'photo_then_text' || plan.kind === 'photo_and_audio_then_text') {
    if (!photoMessageId) {
      const photoResult = await input.client.sendPhoto(input.chatId, input.mediaUrl as string, linkedCaptionFor(input.contentType));
      photoMessageId = photoResult.messageId;
      await setTelegramPostPhotoMessageId(input.postId, photoMessageId);
    }
  }

  if (plan.kind === 'audio_then_text' || plan.kind === 'photo_and_audio_then_text') {
    if (!audioMessageId) {
      const audioResult = await input.client.sendAudio(input.chatId, input.audioUrl as string, audioLinkedCaptionFor(input.contentType));
      audioMessageId = audioResult.messageId;
      await setTelegramPostAudioMessageId(input.postId, audioMessageId);
    }
  }

  const { messageId: textMessageId } = await input.client.sendMessage(input.chatId, input.text);
  return { textMessageId, photoMessageId, audioMessageId };
}
