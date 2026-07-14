import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedSaintDetail } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { localeNames, translate, withLocale } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';
import type { Saint } from '@/lib/types';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchSaint(slug, token, locale);
  const saint = page?.saint;
  if (!saint) {
    return {
      ...pageMetadata({ title: translate(locale, 'saintNotFound'), path: `/saints/${slug}`, locale }),
      robots: { index: false }
    };
  }
  return pageMetadata({
    title: saint.name,
    description: (saint.shortDescription || saint.biography).replace(/\s+/g, ' ').trim().slice(0, 180),
    path: `/saints/${saint.slug}`,
    image: saint.imageUrl || page?.icon?.imageUrl || undefined,
    locale
  });
}

export default async function SaintPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchSaint(slug, token, locale);
  if (!page) notFound();

  if (!page.saint) {
    const translations = page.translations || [];
    return (
      <main className="page">
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/saints', label: translate(locale, 'navSaints') }]}
          current={translations[0]?.title || slug}
        />
        <section className="page-hero">
          <p className="eyebrow">{translate(locale, 'saintsPageEyebrow')}</p>
          <h1>{translate(locale, 'saintNoTranslation')}</h1>
          {translations.length ? <p>{translate(locale, 'prayerOpenIn')}</p> : null}
        </section>
        {translations.length ? (
          <div className="mini-grid">
            {translations.map((item) => (
              <Link key={item.language} href={withLocale(`/saints/${item.slug}`, item.language)}>
                {item.title}<small>{localeNames[item.language]}</small>
              </Link>
            ))}
          </div>
        ) : null}
        <BackLink href="/saints" label={translate(locale, 'navSaints')} />
      </main>
    );
  }

  const saint: Saint = {
    id: page.saint.id,
    slug: page.saint.slug,
    name: page.saint.name,
    shortDescription: page.saint.shortDescription,
    biography: page.saint.biography,
    feastDay: page.saint.feastDay,
    imageUrl: page.saint.imageUrl || page.icon?.imageUrl || '',
    relatedIcons: page.icon?.slug ? [page.icon.slug] : [],
    prayers: page.prayers.map((prayer) => prayer.slug),
    seoTitle: page.saint.name,
    seoDescription: (page.saint.shortDescription || page.saint.biography).replace(/\s+/g, ' ').trim().slice(0, 180),
    status: page.saint.status === 'published' ? 'published' : 'draft',
    updatedAt: page.saint.updatedAt,
    source: 'church' as const
  };

  return <LocalizedSaintDetail saint={saint} />;
}
