import type { Metadata } from 'next';
import { siteUrl } from './site';

export function pageMetadata(input: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string;
}): Metadata {
  const title = input.title || 'ikona.link | Молитва у иконы';
  const description = input.description || 'Православные QR-страницы икон с молитвами, житиями и духовными материалами.';
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
