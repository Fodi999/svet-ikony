import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://ikona.link';
  const [icons, prayers, saints, churches] = await Promise.all([publicApi.icons(), publicApi.prayers(), publicApi.saints(), publicApi.churches()]);
  const staticPages = ['', '/icons', '/prayers', '/saints', '/gospel', '/churches'];
  return [
    ...staticPages.map((path) => ({ url: `${site}${path}`, lastModified: new Date() })),
    ...icons.filter((item) => item.status === 'published').map((item) => ({ url: `${site}/icons/${item.slug}`, lastModified: item.updatedAt })),
    ...prayers.filter((item) => item.status === 'published').map((item) => ({ url: `${site}/prayers/${item.slug}`, lastModified: new Date() })),
    ...saints.filter((item) => item.status === 'published').map((item) => ({ url: `${site}/saints/${item.slug}`, lastModified: new Date() })),
    ...churches.filter((item) => item.status === 'published').map((item) => ({ url: `${site}/churches#${item.slug}`, lastModified: new Date() }))
  ];
}
