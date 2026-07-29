import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockR2Bucket } from '@/lib/media/test-support/mock-r2-bucket';

const mockBucket = new MockR2Bucket();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { MEDIA_BUCKET: mockBucket } }),
}));

const { GET, HEAD } = await import('./route');

const VALID_KEY = 'media/alphabet/letter-1/card/00000000-0000-4000-8000-000000000000.webp';
const SEGMENTS = ['alphabet', 'letter-1', 'card', '00000000-0000-4000-8000-000000000000.webp'];

function ctx(segments: string[]) {
  return { params: Promise.resolve({ key: segments }) };
}

describe('GET/HEAD /media/*', () => {
  beforeEach(async () => {
    // @ts-expect-error test-only reset of private field
    mockBucket.store = new Map();
    await mockBucket.put(VALID_KEY, new Uint8Array(1000).fill(1), { httpMetadata: { contentType: 'image/webp' } });
  });

  it('serves the object with correct headers on success', async () => {
    const response = await GET(new Request('http://localhost/media/' + SEGMENTS.join('/')), ctx(SEGMENTS));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Content-Length')).toBe('1000');
    expect(response.headers.get('ETag')).toBeTruthy();
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(1000);
  });

  it('never doubles media/media/ when reconstructing the key from route params', async () => {
    // If the route accidentally prepended "media/" twice, this lookup
    // would miss (404) even though the object exists at VALID_KEY.
    const response = await GET(new Request('http://localhost/media/' + SEGMENTS.join('/')), ctx(SEGMENTS));
    expect(response.status).toBe(200);
  });

  it('responds 404 when the object does not exist', async () => {
    const response = await GET(new Request('http://localhost/media/x'), ctx(['alphabet', 'missing', 'card', '11111111-1111-4111-8111-111111111111.webp']));
    expect(response.status).toBe(404);
  });

  it('responds 404 (not 500 or a directory listing) for a path-traversal attempt', async () => {
    const response = await GET(new Request('http://localhost/media/x'), ctx(['..', '..', 'etc', 'passwd']));
    expect(response.status).toBe(404);
  });

  it('responds 404 for an invalid key shape instead of leaking bucket contents', async () => {
    const response = await GET(new Request('http://localhost/media/x'), ctx(['not-a-module', 'x', 'y', 'z.webp']));
    expect(response.status).toBe(404);
  });

  it('handles HEAD with the same headers and no body', async () => {
    const response = await HEAD(new Request('http://localhost/media/' + SEGMENTS.join('/'), { method: 'HEAD' }), ctx(SEGMENTS));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Content-Length')).toBe('1000');
    expect(await response.arrayBuffer()).toEqual(new ArrayBuffer(0));
  });

  it('serves a valid byte range with 206 and Content-Range', async () => {
    const response = await GET(
      new Request('http://localhost/media/' + SEGMENTS.join('/'), { headers: { Range: 'bytes=0-99' } }),
      ctx(SEGMENTS),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-99/1000');
    expect(response.headers.get('Content-Length')).toBe('100');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(100);
  });

  it('responds 416 for an unsatisfiable range', async () => {
    const response = await GET(
      new Request('http://localhost/media/' + SEGMENTS.join('/'), { headers: { Range: 'bytes=5000-6000' } }),
      ctx(SEGMENTS),
    );
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */1000');
  });
});
