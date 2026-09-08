import { describe, expect, it } from 'vitest';
import { resolveRequestedLanguage, resolveTranslation } from './translation-fallback';

describe('resolveRequestedLanguage (PHASE MULTILINGUAL-1 / P0.3)', () => {
  it('accepts uk, ru, en', () => {
    for (const value of ['uk', 'ru', 'en']) {
      const params = new URLSearchParams({ language: value });
      const result = resolveRequestedLanguage(params);
      expect(result).toEqual({ ok: true, language: value });
    }
  });

  it('absent language -> deterministic default (uk), never database sort order', () => {
    const result = resolveRequestedLanguage(new URLSearchParams());
    expect(result).toEqual({ ok: true, language: 'uk' });
  });

  it('invalid language (pl) -> rejected, never falls through to a substitution', () => {
    const result = resolveRequestedLanguage(new URLSearchParams({ language: 'pl' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });

  it('invalid language (de) -> rejected with a 400 and a machine-readable error code', async () => {
    const result = resolveRequestedLanguage(new URLSearchParams({ language: 'de' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body).toEqual({ error: 'invalid_language', message: expect.stringContaining('de') });
    }
  });

  it('empty string language -> rejected (not treated as "absent")', () => {
    const result = resolveRequestedLanguage(new URLSearchParams({ language: '' }));
    expect(result.ok).toBe(false);
  });
});

type Row = { language: string; status: string; slug: string };

function row(language: string, status: string, slug = 'x'): Row {
  return { language, status, slug };
}

describe('resolveTranslation (PHASE MULTILINGUAL-1 / P0.1)', () => {
  it('returns the matching published row for the requested language', () => {
    const siblings = [row('uk', 'published'), row('ru', 'published'), row('en', 'published')];
    const { match, published } = resolveTranslation(siblings, 'ru', false);
    expect(match).toEqual(row('ru', 'published'));
    expect(published).toHaveLength(3);
  });

  it('requested language has no row at all -> match is null, never substitutes a different language (the exact bug being fixed)', () => {
    const siblings = [row('uk', 'published')];
    const { match, published } = resolveTranslation(siblings, 'ru', false);
    expect(match).toBeNull();
    expect(published).toEqual([row('uk', 'published')]);
  });

  it('requested language row exists but is a draft (not preview) -> treated the same as missing, never silently shown', () => {
    const siblings = [row('uk', 'published'), row('ru', 'draft')];
    const { match, published } = resolveTranslation(siblings, 'ru', false);
    expect(match).toBeNull();
    expect(published).toEqual([row('uk', 'published')]);
  });

  it('draft requested-language row IS shown under preview mode', () => {
    const siblings = [row('uk', 'published'), row('ru', 'draft')];
    const { match, published } = resolveTranslation(siblings, 'ru', true);
    expect(match).toEqual(row('ru', 'draft'));
    expect(published).toHaveLength(2);
  });

  it('nothing published anywhere -> match null, published empty (caller treats this as a real 404)', () => {
    const siblings = [row('uk', 'draft'), row('ru', 'draft')];
    const { match, published } = resolveTranslation(siblings, 'uk', false);
    expect(match).toBeNull();
    expect(published).toEqual([]);
  });
});
