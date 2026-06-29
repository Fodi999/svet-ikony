import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/api';
import { locales, withLocale } from '@/lib/i18n';
import { siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [icons, prayers, saints, churches, churchItems] = await Promise.all([publicApi.icons(), publicApi.prayers(), publicApi.saints(), publicApi.churches(), publicApi.churchSitemap()]);
  const staticPages = ['', '/icons', '/prayers', '/saints', '/gospel', '/churches'];
  const localized = (path: string) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(path || '/', locale)}`, lastModified: new Date() }));
  const churchPath = (kind: string, slug: string) => {
    if (kind === 'calendar') return `/church/calendar/${slug}`;
    if (kind === 'icon') return `/church/icons/${slug}`;
    if (kind === 'prayer') return `/church/prayers/${slug}`;
    return `/church/articles/${slug}`;
  };

  return [
    ...staticPages.flatMap(localized),
    ...icons.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/icons/${item.slug}`, locale)}`, lastModified: item.updatedAt }))),
    ...prayers.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/prayers/${item.slug}`, locale)}`, lastModified: new Date() }))),
    ...saints.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/saints/${item.slug}`, locale)}`, lastModified: new Date() }))),
    ...churches.filter((item) => item.status === 'published').flatMap((item) => locales.map((locale) => ({ url: `${siteUrl}${withLocale(`/churches#${item.slug}`, locale)}`, lastModified: new Date() }))),
    ...churchItems.flatMap((item) => locales.map((locale) => ({
      url: `${siteUrl}${withLocale(churchPath(item.kind, item.slug), locale)}`,
      lastModified: item.updatedAt
    })))
  ];
}
