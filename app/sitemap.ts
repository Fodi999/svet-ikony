import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/api';
import { siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [icons, prayers, saints, churches] = await Promise.all([publicApi.icons(), publicApi.prayers(), publicApi.saints(), publicApi.churches()]);
  const staticPages = ['', '/icons', '/prayers', '/saints', '/gospel', '/churches'];
  return [
    ...staticPages.map((path) => ({ url: `${siteUrl}${path}`, lastModified: new Date() })),
    ...icons.filter((item) => item.status === 'published').map((item) => ({ url: `${siteUrl}/icons/${item.slug}`, lastModified: item.updatedAt })),
    ...prayers.filter((item) => item.status === 'published').map((item) => ({ url: `${siteUrl}/prayers/${item.slug}`, lastModified: new Date() })),
    ...saints.filter((item) => item.status === 'published').map((item) => ({ url: `${siteUrl}/saints/${item.slug}`, lastModified: new Date() })),
    ...churches.filter((item) => item.status === 'published').map((item) => ({ url: `${siteUrl}/churches#${item.slug}`, lastModified: new Date() }))
  ];
}
