import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockR2Bucket } from '@/lib/media/test-support/mock-r2-bucket';

const mockBucket = new MockR2Bucket();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { MEDIA_BUCKET: mockBucket } }),
}));

const { validateTelegramMediaAsset, TELEGRAM_AUDIO_MAX_BYTES, TELEGRAM_PHOTO_MAX_BYTES } = await import('./media-limits');

const PHOTO_KEY = 'media/telegram/day1/post-image/11111111-1111-1111-1111-111111111111.jpg';
const AUDIO_KEY = 'media/telegram/day1/post-audio/22222222-2222-2222-2222-222222222222.mp3';
const OGG_KEY = 'media/telegram/day1/post-audio/33333333-3333-3333-3333-333333333333.ogg';

function urlFor(key: string): string {
  return `https://svetikony.com/${key}`;
}

/** ApiError's own `.message` is always one of a handful of fixed generic
 * strings ("Validation failed", ...) -- the specific reason lives in
 * `.details` (see lib/d1/errors.ts). */
async function expectRejectionDetails(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toMatchObject({ details: expect.stringMatching(pattern) });
}

describe('validateTelegramMediaAsset', () => {
  beforeEach(() => {
    mockBucket.reset();
  });

  it('resolves silently for a photo under the 5 MB URL-send limit', async () => {
    await mockBucket.put(PHOTO_KEY, new Uint8Array(1024), { httpMetadata: { contentType: 'image/jpeg' } });
    await expect(validateTelegramMediaAsset(urlFor(PHOTO_KEY), 'photo')).resolves.toBeUndefined();
  });

  it('rejects a photo at or over the 5 MB URL-send limit', async () => {
    await mockBucket.put(PHOTO_KEY, new Uint8Array(TELEGRAM_PHOTO_MAX_BYTES + 1), { httpMetadata: { contentType: 'image/jpeg' } });
    await expectRejectionDetails(validateTelegramMediaAsset(urlFor(PHOTO_KEY), 'photo'), /5 MB limit/);
  });

  it('resolves silently for an MP3 audio file under the 20 MB URL-send limit', async () => {
    await mockBucket.put(AUDIO_KEY, new Uint8Array(1024), { httpMetadata: { contentType: 'audio/mpeg' } });
    await expect(validateTelegramMediaAsset(urlFor(AUDIO_KEY), 'audio')).resolves.toBeUndefined();
  });

  it('resolves silently for an M4A (audio/mp4) audio file', async () => {
    await mockBucket.put(AUDIO_KEY, new Uint8Array(1024), { httpMetadata: { contentType: 'audio/mp4' } });
    await expect(validateTelegramMediaAsset(urlFor(AUDIO_KEY), 'audio')).resolves.toBeUndefined();
  });

  it('rejects audio at or over the 20 MB URL-send limit', async () => {
    await mockBucket.put(AUDIO_KEY, new Uint8Array(TELEGRAM_AUDIO_MAX_BYTES + 1), { httpMetadata: { contentType: 'audio/mpeg' } });
    await expectRejectionDetails(validateTelegramMediaAsset(urlFor(AUDIO_KEY), 'audio'), /20 MB limit/);
  });

  it('rejects OGG audio even though the Media Library itself allows it for other modules -- MP3/M4A only for Telegram', async () => {
    await mockBucket.put(OGG_KEY, new Uint8Array(1024), { httpMetadata: { contentType: 'audio/ogg' } });
    await expectRejectionDetails(validateTelegramMediaAsset(urlFor(OGG_KEY), 'audio'), /MP3 or M4A/);
  });

  it('rejects a mediaUrl that is not a real Media Library object key', async () => {
    await expectRejectionDetails(validateTelegramMediaAsset('https://example.com/not-media.jpg', 'photo'), /not a valid Media Library object/);
  });

  it('rejects a well-formed key that has nothing stored in R2 (never uploaded, or already deleted)', async () => {
    await expectRejectionDetails(validateTelegramMediaAsset(urlFor(PHOTO_KEY), 'photo'), /not found/);
  });
});
