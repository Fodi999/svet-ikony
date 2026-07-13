import type { Metadata } from 'next';
import { locales, type Locale } from './i18n';
import { siteUrl } from './site';

export function pageMetadata(input: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string;
  locale?: Locale;
}): Metadata {
  const title = input.title || 'ikona.link | Молитва біля ікони';
  const description = input.description || 'Православні QR-сторінки ікон з молитвами, житіями та духовними матеріалами.';
  const path = input.path || '/';
  const localizedPath = (locale: Locale) => (path === '/' ? `/${locale}` : `/${locale}${path}`);
  const url = input.locale ? `${siteUrl}${localizedPath(input.locale)}` : `${siteUrl}${path}`;
  const languages = input.locale
    ? Object.fromEntries(locales.map((locale) => [locale, `${siteUrl}${localizedPath(locale)}`]))
    : undefined;
  return {
    title,
    description,
    keywords: input.keywords,
    alternates: { canonical: url, languages },
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
