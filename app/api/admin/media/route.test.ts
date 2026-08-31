import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockR2Bucket } from '@/lib/media/test-support/mock-r2-bucket';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockBucket = new MockR2Bucket();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: { MEDIA_BUCKET: mockBucket, ADMIN_JWT_SECRET: TEST_JWT_SECRET, SITE_URL: 'https://svetikony.com' },
  }),
}));

const { DELETE, GET } = await import('./route');

const VALID_KEY = 'media/alphabet/letter-1/card/00000000-0000-4000-8000-000000000000.webp';

function deleteRequest(body: unknown, token?: string) {
  return new Request('http://localhost/api/admin/media', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

function getRequest(query: string, token?: string) {
  return new Request(`http://localhost/api/admin/media${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('DELETE /api/admin/media', () => {
  let token: string;

  beforeEach(async () => {
    mockBucket.reset();
    await mockBucket.put(VALID_KEY, new Uint8Array(10), { httpMetadata: { contentType: 'image/webp' } });
    token = await mintTestAdminJwt();
  });

  it('deletes a valid key belonging to the media/ prefix', async () => {
    const response = await DELETE(deleteRequest({ key: VALID_KEY }, token));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ key: VALID_KEY, deleted: true });
    expect(await mockBucket.head(VALID_KEY)).toBeNull();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await DELETE(deleteRequest({ key: VALID_KEY }));
    expect(response.status).toBe(401);
  });

  it('rejects a request with insufficient role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await DELETE(deleteRequest({ key: VALID_KEY }, weakToken));
    expect(response.status).toBe(403);
  });

  it('rejects an arbitrary key outside the media/ prefix', async () => {
    const response = await DELETE(deleteRequest({ key: 'not-media/foo.jpg' }, token));
    expect(response.status).toBe(400);
  });

  it('rejects an absolute URL passed as a key', async () => {
    const response = await DELETE(deleteRequest({ key: 'https://example.com/media/alphabet/x/card/00000000-0000-4000-8000-000000000000.jpg' }, token));
    expect(response.status).toBe(400);
  });

  it('rejects a legacy backend URL passed as a key', async () => {
    const response = await DELETE(
      deleteRequest({ key: 'https://ministerial-yetta-fodi999-c58d8823.koyeb.app/product-images/foo.jpg' }, token),
    );
    expect(response.status).toBe(400);
  });

  it('rejects a path-traversal attempt', async () => {
    const response = await DELETE(deleteRequest({ key: 'media/alphabet/../../secret/card/00000000-0000-4000-8000-000000000000.jpg' }, token));
    expect(response.status).toBe(400);
  });

  it('returns a predictable 404 when the object does not exist', async () => {
    const response = await DELETE(deleteRequest({ key: 'media/alphabet/other/card/11111111-1111-4111-8111-111111111111.webp' }, token));
    expect(response.status).toBe(404);
  });

  it('returns 400 when key is missing entirely', async () => {
    const response = await DELETE(deleteRequest({}, token));
    expect(response.status).toBe(400);
  });
});

describe('GET /api/admin/media', () => {
  let token: string;

  beforeEach(async () => {
    mockBucket.reset();
    await mockBucket.put(VALID_KEY, new Uint8Array(10), {
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { module: 'alphabet', entityId: 'letter-1', purpose: 'card' },
    });
    await mockBucket.put('media/telegram/post/post-image/11111111-1111-4111-8111-111111111111.jpg', new Uint8Array(20), {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { module: 'telegram', entityId: 'post', purpose: 'post-image' },
    });
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await GET(getRequest(''));
    expect(response.status).toBe(401);
  });

  it('lists every object under media/ when no module filter is given', async () => {
    const response = await GET(getRequest('', token));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { key: string; kind: string; url: string }[]; cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.cursor).toBeNull();
  });

  it('narrows to one module prefix', async () => {
    const response = await GET(getRequest('?module=telegram', token));
    const body = (await response.json()) as { items: { key: string; kind: string; url: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.key).toContain('media/telegram/');
    expect(body.items[0]!.kind).toBe('image');
  });

  it('builds every URL from the server-side SITE_URL, never localhost -- this is what the admin Media Picker fetches', async () => {
    const response = await GET(getRequest('', token));
    const body = (await response.json()) as { items: { key: string; url: string }[] };
    for (const item of body.items) {
      expect(item.url).toBe(`https://svetikony.com/${item.key}`);
      expect(item.url).not.toContain('localhost');
    }
  });

  it('rejects an unknown module', async () => {
    const response = await GET(getRequest('?module=not-a-real-module', token));
    expect(response.status).toBe(400);
  });
});
