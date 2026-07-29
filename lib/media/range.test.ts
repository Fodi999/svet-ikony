import { describe, expect, it } from 'vitest';
import { contentRangeHeader, parseRangeHeader } from './range';

describe('parseRangeHeader', () => {
  const SIZE = 1000;

  it('returns null when there is no Range header', () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull();
  });

  it('parses a start-end range', () => {
    expect(parseRangeHeader('bytes=0-99', SIZE)).toEqual({ offset: 0, length: 100 });
  });

  it('parses an open-ended range (start-)', () => {
    expect(parseRangeHeader('bytes=900-', SIZE)).toEqual({ offset: 900, length: 100 });
  });

  it('parses a suffix range (-N, last N bytes)', () => {
    expect(parseRangeHeader('bytes=-100', SIZE)).toEqual({ offset: 900, length: 100 });
  });

  it('clamps an end beyond the object size', () => {
    expect(parseRangeHeader('bytes=900-9999', SIZE)).toEqual({ offset: 900, length: 100 });
  });

  it('returns unsatisfiable when start is beyond the object size', () => {
    expect(parseRangeHeader('bytes=1000-1999', SIZE)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable when start > end', () => {
    expect(parseRangeHeader('bytes=500-100', SIZE)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable for a suffix longer than the object', () => {
    expect(parseRangeHeader('bytes=-0', SIZE)).toBe('unsatisfiable');
  });

  it('falls back to null (full body) for a malformed header', () => {
    expect(parseRangeHeader('bytes=abc-def', SIZE)).toBeNull();
    expect(parseRangeHeader('not-a-range', SIZE)).toBeNull();
  });

  it('falls back to null (full body) for a multi-range request (unsupported)', () => {
    expect(parseRangeHeader('bytes=0-99,200-299', SIZE)).toBeNull();
  });
});

describe('contentRangeHeader', () => {
  it('formats a Content-Range header', () => {
    expect(contentRangeHeader({ offset: 0, length: 100 }, 1000)).toBe('bytes 0-99/1000');
    expect(contentRangeHeader({ offset: 900, length: 100 }, 1000)).toBe('bytes 900-999/1000');
  });
});
