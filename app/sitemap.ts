import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/api';
import { locales, withLocale } from '@/lib/i18n';
import { localesWithNonEmpty } from '@/lib/seo';
import { siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [saintsByLocale, churches, churchItems, iconsAndPrayersByLocale, alphabetByLocale, products] = await Promise.all([
    // PHASE MULTILINGUAL-1 / P0.7: fetched per locale (like icons/prayers
    // below), not once with no locale at all -- see the `saints` mapping
    // below for why.
    Promise.all(locales.map(async (locale) => ({
      locale,
      saints: await publicApi.saints(locale)
    }))),
    publicApi.churches(),
    publicApi.churchSitemap(),
    Promise.all(locales.map(async (locale) => ({
      locale,
      icons: await publicApi.icons(locale),
      prayers: await publicApi.prayers(locale)
    }))),
    Promise.all(locales.map(async (locale) => ({
      locale,
      letters: await publicApi.churchAlphabetList(locale)
    }))),
    publicApi.products()
  ]);
  const staticPages = ['', '/icons', '/shop', '/prayers', '/saints', '/gospel', '/churches', '/staroslavyanskaya-azbuka'];
  const localized = (path: string) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(path || '/', locale)}`, lastModified: new Date() }));
  const churchPath = (kind: string, slug: string) => {
    if (kind === 'calendar') return `/church/calendar/${slug}`;
    if (kind === 'gospel') return `/church/gospel/${slug}`;
    if (kind === 'saint') return `/saints/${slug}`;
    return `/church/articles/${slug}`;
  };

  return [
    ...staticPages.flatMap(localized),
    // Icon and prayer URLs are listed per locale so only languages that
    // actually have a published translation end up in the sitemap. Since
    // PHASE MULTILINGUAL-1 / P0.2, publicApi.icons()/.prayers() can return
    // untranslated same-slug fallback rows (translated: false) so RU/EN
    // catalog pages aren't empty -- those must never be advertised here,
    // or the sitemap would claim a translated page exists when it doesn't.
    ...iconsAndPrayersByLocale.flatMap(({ locale, icons, prayers }) => [
      ...icons.filter((item) => item.translated !== false).map((item) => ({ url: `${siteUrl}${withLocale(`/icons/${item.slug}`, locale)}`, lastModified: new Date(item.updatedAt) })),
      ...prayers.filter((item) => item.translated !== false).map((item) => ({ url: `${siteUrl}${withLocale(`/prayers/${item.slug}`, locale)}`, lastModified: new Date() }))
    ]),
    // PHASE MULTILINGUAL-1 / P0.7 -- POLICY: saints, exactly like
    // icons/prayers above. `publicApi.saints()` used to be called with NO
    // locale at all, then every published saint got all 3 locale URLs
    // unconditionally (`locales.map(...)`) regardless of whether that
    // saint was actually translated into ru/en. Fetched per locale instead
    // (same `applyListLanguageFallback` machinery icons/prayers already go
    // through -- see publicApi.saints()/churchSaintList()), filtering out
    // `translated === false` same-slug fallback rows so only a locale that
    // genuinely has a published saint row gets a URL, at that row's own
    // (possibly locale-specific) slug.
    ...saintsByLocale.flatMap(({ locale, saints }) => saints
      .filter((item) => item.status === 'published' && item.translated !== false)
      .map((item) => ({ url: `${siteUrl}${withLocale(`/saints/${item.slug}`, locale)}`, lastModified: item.updatedAt ? new Date(item.updatedAt) : new Date() }))),
    // Alphabet letter URLs are listed per locale so only languages that
    // actually have a published translation end up in the sitemap.
    ...alphabetByLocale.flatMap(({ locale, letters }) => letters
      .filter((item) => item.status === 'published')
      .map((item) => ({ url: `${siteUrl}${withLocale(`/staroslavyanskaya-azbuka/${item.slug}`, locale)}`, lastModified: new Date(item.updatedAt) }))),
    // PHASE MULTILINGUAL-1 / P0.7 -- POLICY: churches (church directory
    // listing, `/churches#slug` anchors -- NOT the single-row `church_info`
    // site info). The `Church` type has no per-language field at all (no
    // `language`, no `translated`, no per-locale name/description columns)
    // -- there is currently no data this file could check to decide "is
    // this church translated into ru/en", so the pre-existing unconditional
    // 3-locale fan-out is kept as the only implementable policy today. In
    // practice this is moot right now: `publicApi.churches()` reads from
    // the legacy `/api/content` aggregator, which was fully retired in
    // Stage 2E (the route no longer exists) and always resolves to an
    // empty array via `apiGet`'s fallback -- so `churches` here is always
    // `[]` and this branch currently emits nothing. Documented so whoever
    // reconnects real church-directory data to a locale-aware source
    // revisits this fan-out at the same time (mirroring the `saints` fix
    // above, or the products fix below, depending on the shape that data
    // ends up taking).
    ...churches.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/churches#${item.slug}`, locale)}`, lastModified: new Date() }))),
    // PHASE MULTILINGUAL-1 / P0.7 -- POLICY: calendar/gospel/article
    // (church_calendar_days / church_gospel_readings / church_articles).
    // Each row now carries its own `language` (added to
    // `/api/church/sitemap`'s response for exactly this purpose) -- these
    // three entities have no "untranslated fallback" concept the way
    // icons/saints/prayers do (P0.2 only ever covered those 3 catalog
    // lists), so a row simply IS or ISN'T published in a given language;
    // there's nothing to fall back to. One URL per row, at that row's own
    // language, never a `locales.map(...)` fan-out -- a calendar day/
    // article/gospel reading with only a uk row must not advertise ru/en
    // URLs that 404. `saint` kind is excluded here (`kind !== 'saint'`,
    // added alongside the pre-existing icon/prayer exclusion): saints are
    // already fully handled above via `saintsByLocale`, and this endpoint's
    // `saints` rows carry no such per-locale-slug fallback filtering --
    // keeping them here too would both duplicate every saint URL and
    // reintroduce the exact unconditional-fan-out bug the saints fix above
    // just removed.
    ...churchItems
      .filter((item) => item.kind !== 'prayer' && item.kind !== 'icon' && item.kind !== 'saint')
      .map((item) => ({
        url: `${siteUrl}${withLocale(churchPath(item.kind, item.slug), item.language)}`,
        lastModified: new Date(item.updatedAt)
      })),
    // PHASE MULTILINGUAL-1 / P0.7 -- POLICY: products (physically the
    // `icon_order_options` table -- see lib/d1/repositories/products.ts).
    // Single row per product, multi-column per language (`nameUk`/
    // `nameRu`/`nameEn`, ...) rather than one row per language -- there is
    // no separate slug per locale (`item.slug` is the same URL for every
    // language), so "translated into locale L" means "the nameL column is
    // genuinely non-empty" (see lib/seo.ts's `localesWithNonEmpty()`,
    // shared with app/shop/[slug]/page.tsx's hreflang computation so the
    // sitemap and the page's own <link rel="alternate"> tags can never
    // disagree). A product with an empty nameRu, e.g., no longer gets a
    // `/ru/shop/...` sitemap entry.
    ...products.flatMap((item) => localesWithNonEmpty({ uk: item.nameUk, ru: item.nameRu, en: item.nameEn }).map((locale) => ({
      url: `${siteUrl}${withLocale(`/shop/${item.slug}`, locale)}`,
      lastModified: new Date(item.updatedAt)
    })))
  ];
}
