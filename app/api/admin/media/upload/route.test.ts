import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockR2Bucket } from '@/lib/media/test-support/mock-r2-bucket';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';
import type { MediaObjectDto } from '@/lib/media/types';

const mockBucket = new MockR2Bucket();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: { MEDIA_BUCKET: mockBucket, ADMIN_JWT_SECRET: TEST_JWT_SECRET, SITE_URL: 'https://svetikony.com' },
  }),
}));

const { POST } = await import('./route');

function uploadRequest(fields: Record<string, string | Blob>, token?: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request('http://localhost/api/admin/media/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
}

function smallJpeg(sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], 'photo.jpg', { type: 'image/jpeg' });
}

function smallMp3(sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], 'audio.mp3', { type: 'audio/mpeg' });
}

describe('POST /api/admin/media/upload', () => {
  let token: string;

  beforeEach(async () => {
    token = await mintTestAdminJwt();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a valid image and returns a MediaObjectDto without internal details', async () => {
    const response = await POST(
      uploadRequest({ file: smallJpeg(), module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, token),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as MediaObjectDto;
    expect(body.key).toMatch(/^media\/alphabet\/letter-1\/card\/[0-9a-f-]{36}\.jpg$/);
    expect(body.url).toContain(body.key);
    expect(body.url).toBe(`https://svetikony.com/${body.key}`);
    expect(body.url).not.toContain('localhost');
    expect(body.contentType).toBe('image/jpeg');
    expect(body.size).toBe(1024);
    expect(body.kind).toBe('image');
    expect(body.etag).toBeTruthy();
    expect(body).not.toHaveProperty('bucket');
    expect(body).not.toHaveProperty('accountId');
    expect(JSON.stringify(body)).not.toContain('svetikony-media');
  });

  it('uploads a valid audio file for the Telegram Content Plan\'s "post-audio" purpose (regression: mediaKindForPurpose used to only recognize the literal purpose "audio", so a real MP3 here was misclassified as an image and rejected with 415)', async () => {
    const response = await POST(uploadRequest({ file: smallMp3(), module: 'telegram', entityId: '2026-09-02-morning_prayer', purpose: 'post-audio' }, token));
    expect(response.status).toBe(201);
    const body = (await response.json()) as MediaObjectDto;
    expect(body.key).toMatch(/^media\/telegram\/2026-09-02-morning_prayer\/post-audio\/[0-9a-f-]{36}\.mp3$/);
    expect(body.contentType).toBe('audio/mpeg');
    expect(body.kind).toBe('audio');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await POST(uploadRequest({ file: smallJpeg(), module: 'alphabet', entityId: 'letter-1', purpose: 'card' }));
    expect(response.status).toBe(401);
  });

  it('rejects a request with insufficient role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await POST(
      uploadRequest({ file: smallJpeg(), module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, weakToken),
    );
    expect(response.status).toBe(403);
  });

  it('returns 400 when file is missing', async () => {
    const form = new FormData();
    form.append('module', 'alphabet');
    form.append('entityId', 'letter-1');
    form.append('purpose', 'card');
    const response = await POST(
      new Request('http://localhost/api/admin/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid metadata (unknown module)', async () => {
    const response = await POST(uploadRequest({ file: smallJpeg(), module: 'not-a-module', entityId: 'x', purpose: 'card' }, token));
    expect(response.status).toBe(400);
  });

  it('returns 400 for a purpose not allowed on the given module', async () => {
    const response = await POST(uploadRequest({ file: smallJpeg(), module: 'alphabet', entityId: 'x', purpose: 'audio' }, token));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an unsafe entityId (path traversal attempt)', async () => {
    const response = await POST(uploadRequest({ file: smallJpeg(), module: 'alphabet', entityId: '../etc', purpose: 'card' }, token));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an empty file', async () => {
    const empty = new File([], 'empty.jpg', { type: 'image/jpeg' });
    const response = await POST(uploadRequest({ file: empty, module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, token));
    expect(response.status).toBe(400);
  });

  it('returns 415 for an unsupported MIME type', async () => {
    const gif = new File([new Uint8Array(10)], 'anim.gif', { type: 'image/gif' });
    const response = await POST(uploadRequest({ file: gif, module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, token));
    expect(response.status).toBe(415);
  });

  it('returns 415 when the MIME kind does not match the purpose (audio file for an image purpose)', async () => {
    const mp3 = new File([new Uint8Array(10)], 'song.mp3', { type: 'audio/mpeg' });
    const response = await POST(uploadRequest({ file: mp3, module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, token));
    expect(response.status).toBe(415);
  });

  it('returns 413 for an oversized image', async () => {
    const oversized = smallJpeg(15 * 1024 * 1024 + 1);
    const response = await POST(uploadRequest({ file: oversized, module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, token));
    expect(response.status).toBe(413);
  });

  it('surfaces an R2 put() failure as a 500 without leaking internals', async () => {
    const failingBucket = new MockR2Bucket();
    vi.spyOn(failingBucket, 'put').mockRejectedValueOnce(new Error('simulated R2 outage'));
    vi.doMock('@opennextjs/cloudflare', () => ({
      getCloudflareContext: async () => ({ env: { MEDIA_BUCKET: failingBucket, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
    }));
    vi.resetModules();
    const { POST: POST_WITH_FAILING_BUCKET } = await import('./route');
    const response = await POST_WITH_FAILING_BUCKET(
      uploadRequest({ file: smallJpeg(), module: 'alphabet', entityId: 'letter-1', purpose: 'card' }, token),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('simulated R2 outage');
    vi.doUnmock('@opennextjs/cloudflare');
    vi.resetModules();
  });
});
