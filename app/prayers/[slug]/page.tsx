import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedChurchPrayerDetail } from '@/components/site/LocalizedContent';
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
      <main className="page">
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/prayers', label: translate(locale, 'navPrayers') }]}
          current={translations[0]?.title || slug}
        />
        <section className="page-hero">
          <p className="eyebrow">{translate(locale, 'prayersPageEyebrow')}</p>
          <h1>{translate(locale, 'prayerNoTranslation')}</h1>
          {translations.length ? <p>{translate(locale, 'prayerOpenIn')}</p> : null}
        </section>
        {translations.length ? (
          <div className="mini-grid">
            {translations.map((item) => (
              <Link key={item.language} href={withLocale(`/prayers/${item.slug}`, item.language)}>
                {item.title}<small>{localeNames[item.language]}</small>
              </Link>
            ))}
          </div>
        ) : null}
        <BackLink href="/prayers" label={translate(locale, 'navPrayers')} />
      </main>
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
