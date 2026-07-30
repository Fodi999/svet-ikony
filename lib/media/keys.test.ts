import { describe, expect, it } from 'vitest';
import { buildR2KeyFromRouteSegments, extractMediaKeyFromValue, generateMediaKey, isAllowedModule, isAllowedPurpose, isSafeEntityId, validateMediaKey } from './keys';

describe('generateMediaKey', () => {
  it('produces the expected shape for a valid image upload', () => {
    const key = generateMediaKey({ module: 'alphabet', entityId: 'letter-1', purpose: 'card', mimeType: 'image/webp' });
    expect(key).toMatch(/^media\/alphabet\/letter-1\/card\/[0-9a-f-]{36}\.webp$/);
  });

  it('produces the expected shape for a valid audio upload', () => {
    const key = generateMediaKey({ module: 'prayers', entityId: 'prayer-1', purpose: 'audio', mimeType: 'audio/mpeg' });
    expect(key).toMatch(/^media\/prayers\/prayer-1\/audio\/[0-9a-f-]{36}\.mp3$/);
  });

  it('generates a different key (UUID) on every call, even for identical input', () => {
    const input = { module: 'alphabet', entityId: 'letter-1', purpose: 'card', mimeType: 'image/webp' } as const;
    const a = generateMediaKey(input);
    const b = generateMediaKey(input);
    expect(a).not.toBe(b);
  });

  it('rejects an unknown module', () => {
    expect(() => generateMediaKey({ module: 'not-a-module', entityId: 'x', purpose: 'card', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects a purpose not allowed for the given module', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: 'x', purpose: 'audio', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects an entityId containing path traversal', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: '../etc/passwd', purpose: 'card', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects an entityId containing a slash', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: 'a/b', purpose: 'card', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects an entityId containing a backslash', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: 'a\\b', purpose: 'card', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects an entityId containing spaces', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: 'a b', purpose: 'card', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects an entityId containing Cyrillic characters', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: 'буква', purpose: 'card', mimeType: 'image/webp' })).toThrow();
  });

  it('rejects an unsupported MIME type', () => {
    expect(() => generateMediaKey({ module: 'alphabet', entityId: 'x', purpose: 'card', mimeType: 'image/gif' })).toThrow();
  });
});

describe('isAllowedModule / isAllowedPurpose / isSafeEntityId', () => {
  it('accepts every documented module/purpose pair', () => {
    expect(isAllowedModule('alphabet')).toBe(true);
    expect(isAllowedPurpose('alphabet', 'card')).toBe(true);
    expect(isAllowedPurpose('alphabet', 'main')).toBe(true);
    expect(isAllowedPurpose('prayers', 'image')).toBe(true);
    expect(isAllowedPurpose('prayers', 'audio')).toBe(true);
  });

  it('rejects a purpose from a different module', () => {
    expect(isAllowedPurpose('alphabet', 'audio')).toBe(false);
    expect(isAllowedPurpose('saints', 'card')).toBe(false);
  });

  it('validates entityId format', () => {
    expect(isSafeEntityId('abc-123_XYZ')).toBe(true);
    expect(isSafeEntityId('')).toBe(false);
    expect(isSafeEntityId('..')).toBe(false);
    expect(isSafeEntityId('a/b')).toBe(false);
  });
});

describe('validateMediaKey', () => {
  it('accepts a key produced by generateMediaKey', () => {
    const key = generateMediaKey({ module: 'saints', entityId: 'saint-1', purpose: 'main', mimeType: 'image/jpeg' });
    expect(validateMediaKey(key)).toBe(true);
  });

  it('rejects a key with path traversal', () => {
    expect(validateMediaKey('media/alphabet/../../etc/passwd/card/00000000-0000-4000-8000-000000000000.jpg')).toBe(false);
  });

  it('rejects a key with backslashes', () => {
    expect(validateMediaKey('media\\alphabet\\x\\card\\00000000-0000-4000-8000-000000000000.jpg')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(validateMediaKey('https://example.com/media/alphabet/x/card/00000000-0000-4000-8000-000000000000.jpg')).toBe(false);
  });

  it('rejects a legacy-looking absolute URL', () => {
    expect(validateMediaKey('https://old-backend.koyeb.app/product-images/foo.jpg')).toBe(false);
  });

  it('rejects a key missing the media/ prefix', () => {
    expect(validateMediaKey('alphabet/x/card/00000000-0000-4000-8000-000000000000.jpg')).toBe(false);
  });

  it('rejects a key with an unknown module', () => {
    expect(validateMediaKey('media/not-a-module/x/card/00000000-0000-4000-8000-000000000000.jpg')).toBe(false);
  });

  it('rejects a key whose purpose does not match its module', () => {
    expect(validateMediaKey('media/alphabet/x/audio/00000000-0000-4000-8000-000000000000.mp3')).toBe(false);
  });

  it('rejects a key that does not use a UUID filename', () => {
    expect(validateMediaKey('media/alphabet/x/card/my-photo.jpg')).toBe(false);
  });

  it('rejects a key with an unrecognized extension', () => {
    expect(validateMediaKey('media/alphabet/x/card/00000000-0000-4000-8000-000000000000.gif')).toBe(false);
  });
});

describe('buildR2KeyFromRouteSegments', () => {
  it('prepends media/ exactly once', () => {
    expect(buildR2KeyFromRouteSegments(['prayers', 'id', 'audio', 'file.mp3'])).toBe('media/prayers/id/audio/file.mp3');
  });

  it('never produces a doubled media/media/ prefix for realistic segments', () => {
    const key = buildR2KeyFromRouteSegments(['alphabet', 'letter-1', 'card', '00000000-0000-4000-8000-000000000000.webp']);
    expect(key.startsWith('media/media/')).toBe(false);
    expect(key).toBe('media/alphabet/letter-1/card/00000000-0000-4000-8000-000000000000.webp');
  });

  it('round-trips with a key generated by generateMediaKey', () => {
    const key = generateMediaKey({ module: 'articles', entityId: 'article-1', purpose: 'cover', mimeType: 'image/png' });
    const segments = key.split('/').slice(1); // drop the leading "media" segment, same as Next's routing does
    expect(buildR2KeyFromRouteSegments(segments)).toBe(key);
  });
});

describe('extractMediaKeyFromValue', () => {
  it('extracts the bare key from a resolved absolute media URL (church_prayers.audio_url/image_url shape)', () => {
    expect(extractMediaKeyFromValue('http://localhost:3001/media/prayers/x/audio/00000000-0000-4000-8000-000000000000.mp3')).toBe(
      'media/prayers/x/audio/00000000-0000-4000-8000-000000000000.mp3',
    );
  });

  it('extracts the bare key from a production https URL', () => {
    expect(extractMediaKeyFromValue('https://svetikony.com/media/alphabet/x/card/00000000-0000-4000-8000-000000000000.jpg')).toBe(
      'media/alphabet/x/card/00000000-0000-4000-8000-000000000000.jpg',
    );
  });

  it('returns undefined for an external URL with no /media/ marker', () => {
    expect(extractMediaKeyFromValue('https://example.com/some/other/path.mp3')).toBeUndefined();
  });

  it('returns undefined for null/undefined/empty values', () => {
    expect(extractMediaKeyFromValue(null)).toBeUndefined();
    expect(extractMediaKeyFromValue(undefined)).toBeUndefined();
    expect(extractMediaKeyFromValue('')).toBeUndefined();
  });
});
