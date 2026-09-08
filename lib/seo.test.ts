import { describe, expect, it } from 'vitest';
import { alternateLanguagesFromRefs, localesWithNonEmpty, pageMetadata, resolveLocaleAlternates } from './seo';
import type { ChurchTranslationRef } from './types';

describe('resolveLocaleAlternates (PHASE MULTILINGUAL-1 / P0.5)', () => {
  it('no `languages` override -> same path fanned out across all 3 locale prefixes', () => {
    const alternates = resolveLocaleAlternates({ locale: 'uk', path: '/icons' });
    expect(alternates).toEqual([
      { locale: 'uk', url: 'https://svetikony.com/uk/icons' },
      { locale: 'ru', url: 'https://svetikony.com/ru/icons' },
      { locale: 'en', url: 'https://svetikony.com/en/icons' }
    ]);
  });

  it('the homepage path "/" fans out to /uk, /ru, /en (never a double slash)', () => {
    const alternates = resolveLocaleAlternates({ locale: 'uk', path: '/' });
    expect(alternates.map((a) => a.url)).toEqual([
      'https://svetikony.com/uk',
      'https://svetikony.com/ru',
      'https://svetikony.com/en'
    ]);
  });

  it('`languages` override -> only the locales explicitly listed, at their own given path, never a fabricated same-slug guess', () => {
    const alternates = resolveLocaleAlternates({
      locale: 'uk',
      languages: { uk: '/saints/varvara', ru: '/saints/varvara-ru' }
      // en genuinely missing -- must not appear at all
    });
    expect(alternates).toEqual([
      { locale: 'uk', url: 'https://svetikony.com/uk/saints/varvara' },
      { locale: 'ru', url: 'https://svetikony.com/ru/saints/varvara-ru' }
    ]);
  });

  it('`languages: {}` (nothing published anywhere reachable) -> empty list, not a fallback fan-out', () => {
    expect(resolveLocaleAlternates({ locale: 'uk', languages: {} })).toEqual([]);
  });
});

describe('alternateLanguagesFromRefs (PHASE MULTILINGUAL-1 / P0.5)', () => {
  const refs: ChurchTranslationRef[] = [
    { language: 'ru', slug: 'varvara-ru', title: 'Святая Варвара' },
    { language: 'en', slug: 'barbara', title: 'Saint Barbara' }
  ];

  it('found branch: sibling translations + the current locale/slug', () => {
    const map = alternateLanguagesFromRefs('/saints', refs, { locale: 'uk', slug: 'varvara' });
    expect(map).toEqual({ uk: '/saints/varvara', ru: '/saints/varvara-ru', en: '/saints/barbara' });
  });

  it('missing-translation notice branch (no `current`): only the languages that really exist, current locale absent', () => {
    const map = alternateLanguagesFromRefs('/saints', refs);
    expect(map).toEqual({ ru: '/saints/varvara-ru', en: '/saints/barbara' });
    expect(map.uk).toBeUndefined();
  });

  it('no siblings and no current item -> empty map -> resolveLocaleAlternates produces nothing to advertise', () => {
    expect(alternateLanguagesFromRefs('/saints', [])).toEqual({});
  });
});

describe('localesWithNonEmpty (PHASE MULTILINGUAL-1 / P0.7 -- products/church_info single-row-multi-column policy)', () => {
  it('only locales whose field is genuinely non-empty (not just whitespace) come back', () => {
    expect(localesWithNonEmpty({ uk: 'Свічка', ru: '', en: '   ' })).toEqual(['uk']);
  });

  it('all 3 when every column is filled in', () => {
    expect(localesWithNonEmpty({ uk: 'a', ru: 'b', en: 'c' })).toEqual(['uk', 'ru', 'en']);
  });

  it('none when every column is empty/undefined', () => {
    expect(localesWithNonEmpty({ uk: '', ru: undefined, en: null })).toEqual([]);
  });
});

describe('pageMetadata (PHASE MULTILINGUAL-1 / P0.5 + P0.6, PHASE MULTILINGUAL-2.1 dedup fix)', () => {
  it('self-referencing canonical per locale -- /ru is canonicalized onto /ru, never /uk', () => {
    const meta = pageMetadata({ path: '/icons', locale: 'ru' });
    expect(meta.alternates?.canonical).toBe('https://svetikony.com/ru/icons');
  });

  it('exactly one canonical value -- not an array, never conflicting', () => {
    const meta = pageMetadata({ path: '/icons', locale: 'en' });
    expect(typeof meta.alternates?.canonical).toBe('string');
  });

  /**
   * PHASE MULTILINGUAL-2.1 regression guard: MULTILINGUAL-2's E2E audit
   * found every real SSR page declaring each hreflang language TWICE --
   * Next's own Metadata API renders a `<link>` for `alternates.languages`
   * unconditionally (with a casing bug, see this file's doc comment),
   * *in addition to* components/site/Hreflang.tsx's own correct tags. The
   * fix is `alternates.languages` must never be set on the object
   * `pageMetadata()` returns to Next -- `<Hreflang>` is the sole emitter.
   * These tests fail loudly if that regresses, regardless of whether the
   * caller passed a `languages` override, an omitted one, or none at all.
   */
  it('never sets alternates.languages, even when no `languages` override is given (list/static pages)', () => {
    const meta = pageMetadata({ path: '/icons', locale: 'uk' });
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it('never sets alternates.languages when a `languages` override IS given', () => {
    const meta = pageMetadata({
      path: '/saints/varvara',
      locale: 'uk',
      languages: { uk: '/saints/varvara', ru: '/saints/varvara-ru' }
    });
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it('never sets alternates.languages with no `locale` at all', () => {
    const meta = pageMetadata({ path: '/p/foo' });
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it('accepting a `languages` param does not change the returned Metadata shape\'s own keys beyond canonical', () => {
    const withLanguages = pageMetadata({ path: '/icons', locale: 'uk', languages: { uk: '/icons' } });
    const withoutLanguages = pageMetadata({ path: '/icons', locale: 'uk' });
    expect(Object.keys(withLanguages.alternates ?? {})).toEqual(Object.keys(withoutLanguages.alternates ?? {}));
  });
});
