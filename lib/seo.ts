import type { Metadata } from 'next';
import { locales, type Locale } from './i18n';
import { siteUrl } from './site';
import type { ChurchTranslationRef } from './types';

function localizedPath(path: string, locale: Locale) {
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

export type LocaleAlternate = { locale: Locale; url: string };

/**
 * PHASE MULTILINGUAL-1 / P0.5: resolves which locale variants a page
 * should advertise as alternates. `components/site/Hreflang.tsx` is the
 * sole consumer that renders this as `<link rel="alternate"
 * hreflang="...">` tags (see PHASE MULTILINGUAL-2.1 notes on
 * `pageMetadata()` below for why Next's own Metadata API `alternates.languages`
 * field is deliberately never fed this data, despite accepting the same
 * shape).
 *
 * - `languages` omitted: assumes the identical `path` exists, verbatim,
 *   under all 3 locale prefixes. True for every list/static page in this
 *   app -- a church catalog list always renders *something* per locale,
 *   even an untranslated same-slug fallback row (P0.2's
 *   applyListLanguageFallback) -- and true for the two by-slug detail
 *   routes whose sibling lookup groups strictly by slug, not a
 *   translation_group_id (church/articles/[slug], church/gospel/[slug] --
 *   see those routes' own "no translation_group_id -- siblings are
 *   grouped by slug only" comments): a published sibling in another
 *   language is *guaranteed* to live at this exact same slug there.
 * - `languages` provided: the exact unprefixed path for every locale that
 *   genuinely has published content right now, keyed by locale. Callers
 *   MUST omit any locale without a real published row -- never invent a
 *   same-slug guess for a missing translation. Needed for icons, saints,
 *   prayers and alphabet letters, whose translation groups
 *   (translation_group_id) allow a DIFFERENT slug per language, and whose
 *   translation can be genuinely missing (P0.1) -- see
 *   `alternateLanguagesFromRefs()` below, which builds this map from the
 *   `translations: ChurchTranslationRef[]` those by-slug routes already
 *   return.
 */
export function resolveLocaleAlternates(input: { locale: Locale; path?: string; languages?: Partial<Record<Locale, string>> }): LocaleAlternate[] {
  if (input.languages) {
    return (Object.entries(input.languages) as [Locale, string | undefined][])
      .filter((entry): entry is [Locale, string] => Boolean(entry[1]))
      .map(([locale, path]) => ({ locale, url: `${siteUrl}${localizedPath(path, locale)}` }));
  }
  const path = input.path || '/';
  return locales.map((locale) => ({ locale, url: `${siteUrl}${localizedPath(path, locale)}` }));
}

/**
 * Turns a by-slug detail route's `translations: ChurchTranslationRef[]`
 * (siblings in OTHER languages, per P0.1 -- always excludes the currently
 * resolved item itself) plus that item's own `{locale, slug}` (when one
 * was actually resolved for this request -- omit it entirely on the
 * "translation missing" notice branch, where the current locale has no
 * real content of its own to advertise) into the `languages` map
 * `resolveLocaleAlternates()`/`pageMetadata()` expect.
 */
export function alternateLanguagesFromRefs(basePath: string, refs: ChurchTranslationRef[], current?: { locale: Locale; slug: string }): Partial<Record<Locale, string>> {
  const map: Partial<Record<Locale, string>> = {};
  for (const ref of refs) map[ref.language] = `${basePath}/${ref.slug}`;
  if (current) map[current.locale] = `${basePath}/${current.slug}`;
  return map;
}

/**
 * PHASE MULTILINGUAL-1 / P0.7 (documented policy: products / church_info /
 * product categories). Unlike every entity above, these are single-row,
 * multi-column translations -- one product row has `nameUk`/`nameRu`/
 * `nameEn` (etc.) columns rather than one row per language (see
 * lib/d1/repositories/products.ts's `ChurchProductDto`). A row always
 * "exists" for every locale; "published in locale L" instead means "the
 * name field for L is genuinely non-empty" -- an empty column means that
 * language was never filled in, same intent as a missing row elsewhere.
 * Reused by both app/shop/[slug]/page.tsx (hreflang) and app/sitemap.ts
 * (which locale URLs to advertise for a product).
 */
export function localesWithNonEmpty(fields: Partial<Record<Locale, string | null | undefined>>): Locale[] {
  return locales.filter((locale) => Boolean(fields[locale]?.trim()));
}

export function pageMetadata(input: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string;
  locale?: Locale;
  /** See resolveLocaleAlternates() above. Omit for the default "same path,
   * all 3 locales" behavior. */
  languages?: Partial<Record<Locale, string>>;
}): Metadata {
  const title = input.title || 'svetikony.com | Молитва біля ікони';
  const description = input.description || 'Православні QR-сторінки ікон з молитвами, житіями та духовними матеріалами.';
  const path = input.path || '/';
  const url = input.locale ? `${siteUrl}${localizedPath(path, input.locale)}` : `${siteUrl}${path}`;
  // PHASE MULTILINGUAL-1 / P0.5, PHASE MULTILINGUAL-2.1 -- this function
  // deliberately does NOT put `alternates.languages` into the Metadata
  // object it returns, even though it still accepts `input.languages` (so
  // every call site can pass the same args to both this function and
  // `<Hreflang>` below without change). An earlier version of this
  // function DID set `alternates.languages`, on the theory that Next's own
  // renderer for that field was broken (emits a camelCase `hrefLang` prop
  // with no casing alias in this Next.js build's vendored React 19 SSR
  // renderer, so it prints as literal `hrefLang="uk"`, invisible to
  // case-sensitive tooling) and therefore harmless to leave in "as pure
  // data, for whatever still reads it." That assumption was wrong and
  // caused a real regression: Next's Metadata API renders its own `<link>`
  // for `alternates.languages` UNCONDITIONALLY, so every page ended up
  // with the real language declared TWICE -- Next's broken-cased tag and
  // `<Hreflang>`'s correct one, both present in the same response
  // (confirmed directly against real SSR HTML, `next build && next start`).
  // components/site/Hreflang.tsx is the sole source of alternate-language
  // `<link>` tags now; only `canonical` comes from this function's return
  // value. See Hreflang.tsx's own doc comment for the full casing-bug
  // writeup.
  return {
    title,
    description,
    keywords: input.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'svetikony.com',
      type: 'website',
      images: input.image ? [{ url: input.image }] : undefined
    }
  };
}

export function jsonLd(type: 'Organization' | 'Article' | 'IconPage' | 'Product', data: Record<string, unknown>) {
  const schemaType = type === 'IconPage' ? 'Article' : type;
  return {
    '@context': 'https://schema.org',
    '@type': schemaType,
    ...data
  };
}
