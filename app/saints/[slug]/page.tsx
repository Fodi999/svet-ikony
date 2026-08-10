import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedSaintDetail } from '@/components/site/LocalizedContent';
import { Eyebrow, Hero, HeroTitle, Lead, MiniGrid, MiniGridLink, MiniGridSmall, Page } from '@/components/site/PageChrome';
import { publicApi } from '@/lib/api';
import { localeNames, translate, withLocale } from '@/lib/i18n';
import { resolveMediaUrl } from '@/lib/media/resolver';
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
    image: resolveMediaUrl(saint.imageUrl) || resolveMediaUrl(page?.icon?.imageUrl) || undefined,
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
      <Page>
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/saints', label: translate(locale, 'navSaints') }]}
          current={translations[0]?.title || slug}
        />
        <Hero>
          <Eyebrow>{translate(locale, 'saintsPageEyebrow')}</Eyebrow>
          <HeroTitle>{translate(locale, 'saintNoTranslation')}</HeroTitle>
          {translations.length ? <Lead>{translate(locale, 'prayerOpenIn')}</Lead> : null}
        </Hero>
        {translations.length ? (
          <MiniGrid>
            {translations.map((item) => (
              <MiniGridLink key={item.language} href={withLocale(`/saints/${item.slug}`, item.language)}>
                {item.title}
                <MiniGridSmall>{localeNames[item.language]}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        ) : null}
        <BackLink href="/saints" label={translate(locale, 'navSaints')} />
      </Page>
    );
  }

  const saint: Saint = {
    id: page.saint.id,
    slug: page.saint.slug,
    name: page.saint.name,
    shortDescription: page.saint.shortDescription,
    biography: page.saint.biography,
    feastDayOldStyle: page.saint.feastDayOldStyle,
    feastDayNewStyle: page.saint.feastDayNewStyle,
    imageUrl: resolveMediaUrl(page.saint.imageUrl) || resolveMediaUrl(page.icon?.imageUrl) || '',
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
