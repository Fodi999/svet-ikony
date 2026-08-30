import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockR2Bucket } from '@/lib/media/test-support/mock-r2-bucket';

const mockSetAutopostImageResult = vi.fn();
vi.mock('@/lib/d1/repositories/telegram-autopost', () => ({
  setAutopostImageResult: mockSetAutopostImageResult,
}));

const mockGenerateTelegramImage = vi.fn();
vi.mock('@/lib/ai/openai-image', () => ({ generateTelegramImage: mockGenerateTelegramImage }));

let bucket: MockR2Bucket;
const mockGetMediaBucket = vi.fn(async () => bucket);
vi.mock('@/lib/d1/env', () => ({ getMediaBucket: mockGetMediaBucket }));

const { ensureAutopostImage } = await import('./autopost-image');

function fakePngBytes(): ArrayBuffer {
  return new TextEncoder().encode('fake-png-bytes').buffer as ArrayBuffer;
}

describe('ensureAutopostImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bucket = new MockR2Bucket();
    mockGenerateTelegramImage.mockResolvedValue({ bytes: fakePngBytes(), mimeType: 'image/png' });
  });

  it('returns the existing mediaUrl unchanged and never calls OpenAI or R2 (retry must not regenerate a saved image)', async () => {
    const result = await ensureAutopostImage({
      postId: 42,
      existingMediaUrl: 'https://svetikony.com/media/telegram/42/post-image/already-there.png',
      contentType: 'saint_of_day',
      apiKey: 'fake-key',
    });

    expect(result).toBe('https://svetikony.com/media/telegram/42/post-image/already-there.png');
    expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
    expect(mockSetAutopostImageResult).not.toHaveBeenCalled();
  });

  it('generates an image, stores it in R2 under media/telegram/<postId>/post-image/, and returns the absolute site URL', async () => {
    const result = await ensureAutopostImage({
      postId: 42,
      existingMediaUrl: null,
      contentType: 'saint_of_day',
      apiKey: 'fake-key',
    });

    expect(result).toMatch(/^https:\/\/svetikony\.com\/media\/telegram\/42\/post-image\/[0-9a-f-]+\.png$/);

    const key = result!.replace('https://svetikony.com/', '');
    const stored = await bucket.get(key);
    expect(stored).not.toBeNull();
    expect(stored?.httpMetadata?.contentType).toBe('image/png');

    expect(mockSetAutopostImageResult).toHaveBeenCalledWith(42, result, null);
  });

  it('never includes the saint name or D1 facts in the image prompt (generic scene by content type only)', async () => {
    await ensureAutopostImage({ postId: 1, existingMediaUrl: null, contentType: 'saint_of_day', apiKey: 'fake-key' });

    const promptUsed = mockGenerateTelegramImage.mock.calls[0][0].prompt as string;
    expect(promptUsed).not.toContain('Олександр');
    expect(promptUsed.toLowerCase()).not.toContain('портрет конкретного');
    expect(promptUsed).toContain('храм');
  });

  it('uses a different scene per content type', async () => {
    await ensureAutopostImage({ postId: 1, existingMediaUrl: null, contentType: 'gospel', apiKey: 'fake-key' });
    await ensureAutopostImage({ postId: 2, existingMediaUrl: null, contentType: 'evening_prayer', apiKey: 'fake-key' });

    const gospelPrompt = mockGenerateTelegramImage.mock.calls[0][0].prompt as string;
    const eveningPrompt = mockGenerateTelegramImage.mock.calls[1][0].prompt as string;
    expect(gospelPrompt).not.toBe(eveningPrompt);
    expect(gospelPrompt).toContain('Євангел');
    expect(eveningPrompt).toContain('вечір');
  });

  it('records the failure via image_error and returns null (never throws) when OpenAI image generation fails', async () => {
    mockGenerateTelegramImage.mockRejectedValueOnce(new Error('no credits remaining'));

    const result = await ensureAutopostImage({
      postId: 42,
      existingMediaUrl: null,
      contentType: 'saint_of_day',
      apiKey: 'fake-key',
    });

    expect(result).toBeNull();
    expect(mockSetAutopostImageResult).toHaveBeenCalledWith(42, null, 'no credits remaining');
  });

  it('records the failure via image_error and returns null (never throws) when the R2 upload fails', async () => {
    bucket.put = vi.fn().mockRejectedValue(new Error('R2 outage'));

    const result = await ensureAutopostImage({
      postId: 42,
      existingMediaUrl: null,
      contentType: 'saint_of_day',
      apiKey: 'fake-key',
    });

    expect(result).toBeNull();
    expect(mockSetAutopostImageResult).toHaveBeenCalledWith(42, null, 'R2 outage');
  });
});
