import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
const route = vi.hoisted(() => ({ pathname: '/uk/pravoslavna-istoriya' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', {...props,'data-client-link':'true'}, children) }));
vi.mock('./BrandLogo', () => ({ BrandLogo: () => null }));
vi.mock('./LanguageProvider', async () => {
  const { localeFromPathname, translate, withLocale } = await import('@/lib/i18n');
  return { LanguageSwitch: () => null, useI18n: () => ({locale:localeFromPathname(route.pathname),setLocale:()=>{}, t: (key: import('@/lib/i18n').TranslationKey) => translate(localeFromPathname(route.pathname), key) }), useLocaleHref: () => (path: string) => withLocale(path, localeFromPathname(route.pathname)) };
});
import { Header } from './Header';
describe('unified site navigation', () => {
  it('enters the planet with document navigation so its Cesium CSP is applied',()=>{
    route.pathname='/ru/explore';
    const anchors=renderToString(React.createElement(Header)).match(/<a [^>]*>/g)??[];
    const planet=anchors.filter(anchor=>anchor.includes('href="/ru"'));
    expect(planet).toHaveLength(3);
    for(const anchor of planet)expect(anchor).not.toContain('data-client-link');
    expect(anchors.find(anchor=>anchor.includes('href="/ru/shop"'))).toContain('data-client-link');
  });
  it.each([['/ru/shop/icon','/ru/shop'],['/en/explore','/en/explore'],['/uk','/uk']])('selects the section for %s', (pathname,href) => {
    route.pathname=pathname;
    const html=renderToString(React.createElement(Header));
    const active=html.match(/<a [^>]*aria-current="page"[^>]*>/g)??[];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain(`href="${href}"`);
    expect(html).not.toMatch(/checkout|account|cart/);
  });
  it.each(['/pravoslavna-istoriya', '/uk/pravoslavna-istoriya', '/ru/pravoslavna-istoriya', '/en/pravoslavna-istoriya'])('marks history as current on %s', (pathname) => {
    route.pathname = pathname;
    const html = renderToString(React.createElement(Header));
    const active = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain(`href="/${pathname.split('/')[1]==='ru'?'ru':pathname.split('/')[1]==='en'?'en':'uk'}"`);
  });
  it('keeps the current state on the original section when leaving history', () => {
    route.pathname = '/uk/prayers';
    const active = renderToString(React.createElement(Header)).match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(active).toHaveLength(1); expect(active[0]).toContain('/uk/explore');
  });
});
