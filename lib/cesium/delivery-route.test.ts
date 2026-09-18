import {beforeEach, expect, it, vi} from 'vitest';
const {bucket} = vi.hoisted(() => ({bucket: {head: vi.fn(), get: vi.fn()}}));
vi.mock('@/lib/d1/env', () => ({getMediaBucket: async () => bucket}));
import {GET, HEAD} from '@/app/cesium/[release]/[...asset]/route';
const context = {params: Promise.resolve({release:'a'.repeat(64),asset:['alps-heightmap','layer.json']})};
beforeEach(() => vi.resetAllMocks());
it('does not expose an incomplete release', async () => {
  bucket.head.mockResolvedValue(null);
  expect((await GET(new Request('https://example.test'), context)).status).toBe(404);
  expect(bucket.get).not.toHaveBeenCalled();
});
it('serves ready assets and conditional responses', async () => {
  bucket.head.mockResolvedValue({size:2,httpEtag:'"abc"'});
  bucket.get.mockResolvedValue({body:'{}'});
  const response = await GET(new Request('https://example.test'), context);
  expect(await response.text()).toBe('{}');
  expect(response.headers.get('content-type')).toBe('application/json');
  bucket.get.mockClear();
  expect((await GET(new Request('https://example.test',{headers:{'if-none-match':'"abc"'}}), context)).status).toBe(304);
  expect(bucket.get).not.toHaveBeenCalled();
  expect((await HEAD(new Request('https://example.test'), context)).headers.get('content-length')).toBe('2');
  expect(bucket.get).not.toHaveBeenCalled();
});
