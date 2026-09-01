import { OpenAiError } from '@/lib/ai/openai';
import { generateTelegramImage } from '@/lib/ai/openai-image';
import { getMediaBucket } from '@/lib/d1/env';
import { setAutopostImageResult, type AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';
import { generateMediaKey } from '@/lib/media/keys';
import { resolveMediaUrl } from '@/lib/media/resolver';
import { absoluteSiteUrl } from '@/lib/site';
import { CONTENT_TYPE_IMAGE_PROMPTS } from './content-format';

/** Best-effort AI image step of the autopost pipeline: D1 facts -> [text,
 * elsewhere] -> here (verified asset, or OpenAI image -> R2 -> media_url)
 * -> Telegram sendPhoto+caption. Never blocks the text-only publish path --
 * every failure (OpenAI or R2) is caught, recorded via
 * setAutopostImageResult's `imageError`, and reported back as `null` so
 * callers fall back to sendMessage. See
 * migration 0009_telegram_autopost_images.sql. */

export type EnsureAutopostImageInput = {
  postId: number;
  /** Already-saved media_url from an earlier attempt (retry path) -- when
   * set, generation is skipped entirely and this value is returned as-is,
   * per "retry must not regenerate an already-saved image". */
  existingMediaUrl: string | null;
  contentType: AutopostContentType;
  apiKey: string;
  imageModel?: string;
  /** church_saints.imageUrl (see autopost-content.ts's AutopostFacts) --
   * when set (saint_of_day only), this real, admin-curated asset is used
   * as-is and OpenAI image generation is never called at all, so a
   * genuine icon/photo always wins over a generic AI temple scene next to
   * the saint's name. Absent/undefined for every other content type. */
  verifiedImageUrl?: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof OpenAiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'unknown error';
}

/** `church_saints.image_url` (like any media field in this codebase) may be
 * a bare R2 key, a site-relative path, or an already-absolute URL --
 * resolveMediaUrl() normalizes that, but Telegram needs a fully-qualified
 * HTTPS URL, so a relative result still needs the site origin prepended. */
async function resolveVerifiedImageUrl(raw: string): Promise<string | null> {
  const resolved = resolveMediaUrl(raw);
  if (!resolved) return null;
  if (resolved.startsWith('/')) return absoluteSiteUrl(resolved);
  return resolved;
}

/** Returns the media_url to publish with (photo), or null to fall back to
 * a text-only send -- never throws, so a failure here can never prevent
 * the text from still being published. */
export async function ensureAutopostImage(input: EnsureAutopostImageInput): Promise<string | null> {
  if (input.existingMediaUrl) return input.existingMediaUrl;

  if (input.verifiedImageUrl) {
    const mediaUrl = await resolveVerifiedImageUrl(input.verifiedImageUrl);
    if (mediaUrl) {
      await setAutopostImageResult(input.postId, mediaUrl, null);
      return mediaUrl;
    }
    // Falls through to AI generation only if the stored value couldn't be
    // resolved to anything usable (e.g. empty after trimming upstream).
  }

  try {
    const prompt = CONTENT_TYPE_IMAGE_PROMPTS[input.contentType];
    const image = await generateTelegramImage({ apiKey: input.apiKey, model: input.imageModel, prompt });

    const entityId = String(input.postId);
    const key = generateMediaKey({ module: 'telegram', entityId, purpose: 'post-image', mimeType: image.mimeType });

    const bucket = await getMediaBucket();
    const putResult = await bucket.put(key, image.bytes, {
      httpMetadata: { contentType: image.mimeType },
      customMetadata: { module: 'telegram', entityId, purpose: 'post-image' },
    });
    if (!putResult) throw new Error(`R2 put() returned no result for key ${key}`);

    const mediaUrl = await absoluteSiteUrl(`/${key}`);
    await setAutopostImageResult(input.postId, mediaUrl, null);
    return mediaUrl;
  } catch (error) {
    await setAutopostImageResult(input.postId, null, errorMessage(error));
    return null;
  }
}
