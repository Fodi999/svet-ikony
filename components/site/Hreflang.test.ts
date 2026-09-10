import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Hreflang } from './Hreflang';

/**
 * PHASE MULTILINGUAL-1 / P0.5 -- the actual regression test for the root
 * cause: Next's own `alternates.languages` Metadata field resolves the
 * right per-locale URLs (see lib/seo.test.ts), but Next's renderer for
 * that field emits a camelCase `hrefLang` React prop
 * (node_modules/next/dist/esm/lib/metadata/metadata.js), and the bundled
 * React 19 SSR renderer has no hrefLang->hreflang casing alias (unlike
 * e.g. crossOrigin->crossorigin), so it's served as literal
 * `hrefLang="uk"` -- which is why a case-sensitive `curl | grep 'hreflang='`
 * against production found nothing, even though the tags were technically
 * present. This renders the REAL component (not a re-implementation) with
 * React's actual SSR renderer (not jsdom, not a snapshot of intent) and
 * inspects the raw HTML string, the same way that audit curled production.
 */
describe('Hreflang (PHASE MULTILINGUAL-1 / P0.5)', () => {
  it('renders a literal lowercase hreflang="xx" attribute for every locale when all 3 languages exist, plus x-default -> uk', () => {
    const html = renderToStaticMarkup(createElement(Hreflang, { locale: 'uk', path: '/icons' }));

    expect(html).toContain('hreflang="uk"');
    expect(html).toContain('hreflang="ru"');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="x-default"');

    // The actual regression guard: must NEVER regress to the broken
    // camelCase form a naive case-sensitive audit can't see.
    expect(html).not.toContain('hrefLang');

    expect(html).toContain('rel="alternate"');
    expect(html).toContain('href="https://svetikony.com/uk/icons"');
    expect(html).toContain('href="https://svetikony.com/ru/icons"');
    expect(html).toContain('href="https://svetikony.com/en/icons"');
  });

  it('omits a language from the rendered HTML entirely when that translation is genuinely missing -- never advertises a non-existent translated version', () => {
    const html = renderToStaticMarkup(
      createElement(Hreflang, {
        locale: 'uk',
        // Only uk and ru are real published translations; en is missing.
        languages: { uk: '/saints/varvara', ru: '/saints/varvara-ru' }
      })
    );

    expect(html).toContain('hreflang="uk"');
    expect(html).toContain('href="https://svetikony.com/uk/saints/varvara"');
    expect(html).toContain('hreflang="ru"');
    expect(html).toContain('href="https://svetikony.com/ru/saints/varvara-ru"');

    // The core rule across P0.5/P0.7: no alternate for a language with no
    // real content.
    expect(html).not.toContain('hreflang="en"');
    expect(html).not.toContain('varvara-en');
  });

  it('x-default points at the uk URL, not whichever locale is "current"', () => {
    const html = renderToStaticMarkup(createElement(Hreflang, { locale: 'ru', path: '/prayers' }));
    expect(html).toContain('href="https://svetikony.com/uk/prayers" hreflang="x-default"');
  });

  it('includeXDefault={false} suppresses the x-default tag entirely', () => {
    const html = renderToStaticMarkup(createElement(Hreflang, { locale: 'uk', path: '/icons', includeXDefault: false }));
    expect(html).not.toContain('x-default');
  });

  it('an empty `languages` map (nothing published at all) renders nothing', () => {
    const html = renderToStaticMarkup(createElement(Hreflang, { locale: 'uk', languages: {} }));
    expect(html).toBe('');
  });

  it('no x-default when uk itself is not among the advertised languages', () => {
    const html = renderToStaticMarkup(createElement(Hreflang, { locale: 'ru', languages: { ru: '/saints/foo-ru' } }));
    expect(html).toContain('hreflang="ru"');
    expect(html).not.toContain('x-default');
  });
});


describe('locale navigation development compatibility', () => {
  it.each([['development','hrefLang'],['production','hreflang']] as const)('keeps all alternate URLs in %s using the appropriate React/HTML attribute', (mode,attribute) => {
    vi.stubEnv('NODE_ENV', mode);
    try {
      const html = renderToStaticMarkup(createElement(Hreflang, {locale:'en',path:'/pravoslavna-istoriya'}));
      for (const locale of ['uk','ru','en','x-default']) expect(html).toContain(`${attribute}="${locale}"`);
      for (const locale of ['uk','ru','en']) expect(html).toContain(`href="https://svetikony.com/${locale}/pravoslavna-istoriya"`);
    } finally { vi.unstubAllEnvs(); }
  });
});
