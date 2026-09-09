import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
const route = vi.hoisted(() => ({ pathname: '/uk/pravoslavna-istoriya' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }));
vi.mock('./BrandLogo', () => ({ BrandLogo: () => null }));
vi.mock('./LanguageProvider', async () => {
  const { localeFromPathname, translate, withLocale } = await import('@/lib/i18n');
  return { LanguageSwitch: () => null, useI18n: () => ({ t: (key: import('@/lib/i18n').TranslationKey) => translate(localeFromPathname(route.pathname), key) }), useLocaleHref: () => (path: string) => withLocale(path, localeFromPathname(route.pathname)) };
});
import { Header } from './Header';
describe('active history navigation', () => {
  it.each(['/pravoslavna-istoriya', '/uk/pravoslavna-istoriya', '/ru/pravoslavna-istoriya', '/en/pravoslavna-istoriya'])('marks history as current on %s', (pathname) => {
    route.pathname = pathname;
    const html = renderToString(React.createElement(Header));
    const active = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('pravoslavna-istoriya');
    expect(active[0]).toContain('bg-gold-light');
    expect(active[0]).toContain('shadow-');
  });
  it('keeps the current state on the original section when leaving history', () => {
    route.pathname = '/uk/prayers';
    const active = renderToString(React.createElement(Header)).match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(active).toHaveLength(1); expect(active[0]).toContain('/uk/prayers');
  });
});
