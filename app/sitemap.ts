import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/api';
import { locales, withLocale } from '@/lib/i18n';
import { siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [saints, churches, churchItems, iconsAndPrayersByLocale, alphabetByLocale] = await Promise.all([
    publicApi.saints(),
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
    })))
  ]);
  const staticPages = ['', '/icons', '/prayers', '/saints', '/gospel', '/churches', '/staroslavyanskaya-azbuka'];
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
    // actually have a published translation end up in the sitemap.
    ...iconsAndPrayersByLocale.flatMap(({ locale, icons, prayers }) => [
      ...icons.map((item) => ({ url: `${siteUrl}${withLocale(`/icons/${item.slug}`, locale)}`, lastModified: item.updatedAt })),
      ...prayers.map((item) => ({ url: `${siteUrl}${withLocale(`/prayers/${item.slug}`, locale)}`, lastModified: new Date() }))
    ]),
    ...saints.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/saints/${item.slug}`, locale)}`, lastModified: new Date() }))),
    // Alphabet letter URLs are listed per locale so only languages that
    // actually have a published translation end up in the sitemap.
    ...alphabetByLocale.flatMap(({ locale, letters }) => letters
      .filter((item) => item.status === 'published')
      .map((item) => ({ url: `${siteUrl}${withLocale(`/staroslavyanskaya-azbuka/${item.slug}`, locale)}`, lastModified: item.updatedAt }))),
    ...churches.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/churches#${item.slug}`, locale)}`, lastModified: new Date() }))),
    ...churchItems.filter((item) => item.kind !== 'prayer' && item.kind !== 'icon').flatMap((item) => locales.map((locale) => ({
      url: `${siteUrl}${withLocale(churchPath(item.kind, item.slug), locale)}`,
      lastModified: item.updatedAt
    })))
  ];
}
