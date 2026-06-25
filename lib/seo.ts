import type { Metadata } from 'next';
import { siteUrl } from './site';

export function pageMetadata(input: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string;
}): Metadata {
  const title = input.title || 'ikona.link | Молитва біля ікони';
  const description = input.description || 'Православні QR-сторінки ікон з молитвами, житіями та духовними матеріалами.';
  const url = `${siteUrl}${input.path || '/'}`;
  return {
    title,
    description,
    keywords: input.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'ikona.link',
      type: 'website',
      images: input.image ? [{ url: input.image }] : undefined
    }
  };
}

export function jsonLd(type: 'Organization' | 'Article' | 'IconPage', data: Record<string, unknown>) {
  const schemaType = type === 'IconPage' ? 'Article' : type;
  return {
    '@context': 'https://schema.org',
    '@type': schemaType,
    ...data
  };
}
