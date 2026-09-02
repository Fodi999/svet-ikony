import { describe, expect, it } from 'vitest';
import { parseImageMetadata } from './calendarDays';

/**
 * Provenance JSON must never crash a read just because an old row predates
 * a field, or because the column somehow holds something unexpected (task:
 * "malformed/null старый image_metadata -- parsing должен быть fail-safe").
 */
describe('parseImageMetadata', () => {
  it('returns null for a null column', () => {
    expect(parseImageMetadata(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseImageMetadata('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseImageMetadata('{not valid json')).toBeNull();
  });

  it('returns null for valid JSON that is not an object (string, number, array)', () => {
    expect(parseImageMetadata('"just a string"')).toBeNull();
    expect(parseImageMetadata('42')).toBeNull();
    expect(parseImageMetadata('[1,2,3]')).toBeNull();
  });

  it('returns null for an object missing the required origin/identityVerified fields', () => {
    expect(parseImageMetadata(JSON.stringify({ referenceTitle: 'Some Saint' }))).toBeNull();
    expect(parseImageMetadata(JSON.stringify({ origin: 'manual' }))).toBeNull();
    expect(parseImageMetadata(JSON.stringify({ origin: 'not-a-real-origin', identityVerified: true }))).toBeNull();
  });

  it('parses a minimal pre-Wikidata-rewrite record (only the original field set) unchanged', () => {
    const legacy = { origin: 'ai_generated', identityVerified: false };
    expect(parseImageMetadata(JSON.stringify(legacy))).toEqual(legacy);
  });

  it('parses a full record with every new provenance field populated', () => {
    const full = {
      origin: 'ai_generated',
      referenceProvider: 'commons',
      referenceLanguage: 'en',
      referencePageUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      referenceImageUrl: 'https://upload.wikimedia.org/x.jpg',
      referenceTitle: 'Agathonicus',
      referenceAuthor: 'Unknown',
      referenceLicense: 'Public domain',
      referenceAttribution: 'Wikimedia Commons',
      wikidataId: 'Q3564977',
      commonsFileTitle: 'File:Saint Agathonikos of Nikomedeia Mosaic Medallion, Chora.jpg',
      commonsCategory: 'Agathonikos of Nikomedeia',
      identityVerified: true,
    };
    expect(parseImageMetadata(JSON.stringify(full))).toEqual(full);
  });

  it('parses a manual-origin record with no reference fields at all', () => {
    const manual = { origin: 'manual', identityVerified: false };
    expect(parseImageMetadata(JSON.stringify(manual))).toEqual(manual);
  });
});
