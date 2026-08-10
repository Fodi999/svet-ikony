import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedChurchPrayerDetail } from '@/components/site/LocalizedContent';
import { Eyebrow, Hero, HeroTitle, Lead, MiniGrid, MiniGridLink, MiniGridSmall, Page } from '@/components/site/PageChrome';
import { prayerTypeLabel, publicApi } from '@/lib/api';
import { localeNames, translate, withLocale } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

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
  const page = await publicApi.churchPrayer(slug, token, locale);
  const prayer = page?.prayer;
  if (!prayer) {
    return {
      ...pageMetadata({ title: translate(locale, 'prayerNotFound'), path: `/prayers/${slug}`, locale }),
      robots: { index: false }
    };
  }
  return pageMetadata({
    title: prayer.title,
    description: prayer.text.replace(/\s+/g, ' ').trim().slice(0, 180),
    path: `/prayers/${prayer.slug}`,
    image: prayer.imageUrl || page?.icon?.imageUrl || undefined,
    locale
  });
}

export default async function PrayerPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchPrayer(slug, token, locale);
  if (!page) notFound();

  const prayer = page.prayer;
  if (!prayer) {
    const translations = page.translations || [];
    return (
      <Page>
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/prayers', label: translate(locale, 'navPrayers') }]}
          current={translations[0]?.title || slug}
        />
        <Hero>
          <Eyebrow>{translate(locale, 'prayersPageEyebrow')}</Eyebrow>
          <HeroTitle>{translate(locale, 'prayerNoTranslation')}</HeroTitle>
          {translations.length ? <Lead>{translate(locale, 'prayerOpenIn')}</Lead> : null}
        </Hero>
        {translations.length ? (
          <MiniGrid>
            {translations.map((item) => (
              <MiniGridLink key={item.language} href={withLocale(`/prayers/${item.slug}`, item.language)}>
                {item.title}
                <MiniGridSmall>{localeNames[item.language]}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        ) : null}
        <BackLink href="/prayers" label={translate(locale, 'navPrayers')} />
      </Page>
    );
  }

  return (
    <LocalizedChurchPrayerDetail
      prayer={prayer}
      icon={page.icon}
      calendarDay={page.calendarDay}
      categoryLabel={prayerTypeLabel(prayer.prayerType, locale)}
    />
  );
}
