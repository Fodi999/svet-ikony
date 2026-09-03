import { getMediaBucket } from '@/lib/d1/env';
import { ApiError } from '@/lib/d1/errors';
import { extractMediaKeyFromValue, validateMediaKey } from '@/lib/media/keys';

/**
 * Telegram Bot API limits for sending a file BY URL (not multipart upload)
 * -- confirmed against core.telegram.org/bots/api: 5 MB for photos, 20 MB
 * for everything else (audio included). This delivery pipeline always
 * sends by URL (see lib/telegram/client.ts's sendPhoto/sendAudio, which
 * take a `photoUrl`/`audioUrl` string, never a file body) -- these limits
 * are therefore *tighter* than lib/media/constants.ts's own
 * MAX_IMAGE_BYTES (15 MB) / MAX_AUDIO_BYTES (100 MB), which govern what the
 * shared Media Library will store for every module, not just Telegram's.
 * Deliberately NOT lowering those global limits (other modules/purposes may
 * genuinely need larger files) -- instead this module gates assignment to
 * a Telegram slot specifically, so an oversized asset fails with a clear
 * error at "Обрати з медіатеки" time rather than a cryptic Telegram API
 * error at actual publish time.
 */
export const TELEGRAM_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const TELEGRAM_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

/**
 * sendAudio only renders with Telegram's native audio-player UI (title/
 * artist, scrubber) for formats clients recognize as music -- audio/mpeg
 * (mp3) and audio/mp4 (m4a). audio/ogg is accepted by the Media Library
 * (see lib/media/constants.ts's AUDIO_MIME_EXTENSIONS) for other modules,
 * but is deliberately excluded here: sent via sendAudio it risks landing
 * as a generic document or the voice-message UI instead, depending on
 * client, rather than the intended music-player treatment. Not a hard
 * platform limit -- if a future task needs OGG for Telegram (e.g. via
 * sendVoice for real voice notes, a different method entirely), it belongs
 * as an explicit addition here, not a silent broadening of this set.
 */
export const TELEGRAM_AUDIO_ALLOWED_MIME = new Set(['audio/mpeg', 'audio/mp4']);

export type TelegramMediaKind = 'photo' | 'audio';

/**
 * Re-derives the real R2 object (size, content type) from a stored
 * media/audio URL and checks it against the Telegram-specific limits
 * above -- never trusts a client-supplied size/MIME, since `mediaUrl`/
 * `audioUrl` on the wire is just a string. Throws ApiError.validation with
 * a specific reason on any failure (not a valid Media Library object, too
 * large, wrong format for audio); resolves silently on success.
 *
 * Called from content-plan-actions.ts's assignSlotImage/assignSlotAudio,
 * i.e. exactly the manual "Обрати з медіатеки" path -- AI-generated
 * images (ensureAutopostImage) are not re-validated here, out of scope for
 * this task (see the audit report: this task is about manual upload/
 * assignment, not the existing AI-generation pipeline).
 */
export async function validateTelegramMediaAsset(mediaUrl: string, kind: TelegramMediaKind): Promise<void> {
  const key = extractMediaKeyFromValue(mediaUrl);
  if (!key || !validateMediaKey(key)) {
    throw ApiError.validation('mediaUrl is not a valid Media Library object');
  }

  const bucket = await getMediaBucket();
  const object = await bucket.head(key);
  if (!object) {
    throw ApiError.validation('Media Library object not found');
  }

  const maxBytes = kind === 'photo' ? TELEGRAM_PHOTO_MAX_BYTES : TELEGRAM_AUDIO_MAX_BYTES;
  if (object.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw ApiError.validation(`File exceeds Telegram's ${maxMb} MB limit for ${kind === 'photo' ? 'photos' : 'audio'} sent by URL`);
  }

  if (kind === 'audio') {
    const contentType = object.httpMetadata?.contentType ?? '';
    if (!TELEGRAM_AUDIO_ALLOWED_MIME.has(contentType)) {
      throw ApiError.validation(`Unsupported audio format for Telegram: ${contentType || '(unknown)'} -- use MP3 or M4A`);
    }
  }
}
