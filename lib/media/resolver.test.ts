import { describe, expect, it } from 'vitest';
import { resolveMediaUrl } from './resolver';

describe('resolveMediaUrl', () => {
  it('returns undefined for null/undefined/empty', () => {
    expect(resolveMediaUrl(null)).toBeUndefined();
    expect(resolveMediaUrl(undefined)).toBeUndefined();
    expect(resolveMediaUrl('')).toBeUndefined();
    expect(resolveMediaUrl('   ')).toBeUndefined();
  });

  it('leaves an external absolute URL unchanged', () => {
    expect(resolveMediaUrl('https://external.example/file.jpg')).toBe('https://external.example/file.jpg');
  });

  it('leaves a legacy absolute URL unchanged (does not try to migrate it)', () => {
    expect(resolveMediaUrl('https://ministerial-yetta-fodi999-c58d8823.koyeb.app/product-images/foo.jpg')).toBe(
      'https://ministerial-yetta-fodi999-c58d8823.koyeb.app/product-images/foo.jpg',
    );
  });

  it('leaves a protocol-relative URL unchanged', () => {
    expect(resolveMediaUrl('//cdn.example.com/foo.jpg')).toBe('//cdn.example.com/foo.jpg');
  });

  it('resolves a bare R2 key to a same-origin media path, never doubling media/media/', () => {
    const resolved = resolveMediaUrl('media/prayers/id/audio/file.mp3');
    expect(resolved).toBe('/media/prayers/id/audio/file.mp3');
    expect(resolved).not.toContain('/media/media/');
  });

  it('handles a key with a leading slash without doubling it', () => {
    const resolved = resolveMediaUrl('/media/alphabet/x/card/file.webp');
    expect(resolved).toBe('/media/alphabet/x/card/file.webp');
    expect(resolved?.match(/\/media\//g)?.length).toBe(1);
  });

  it('converts localhost/private media URLs back to same-origin paths to avoid HTTPS mixed content', () => {
    expect(resolveMediaUrl('http://localhost:3001/media/calendar/day/main/file.png')).toBe('/media/calendar/day/main/file.png');
    expect(resolveMediaUrl('http://192.168.1.10/media/calendar/day/main/file.png')).toBe('/media/calendar/day/main/file.png');
    expect(resolveMediaUrl('//localhost:3001/media/calendar/day/main/file.png')).toBe('/media/calendar/day/main/file.png');
  });
});
