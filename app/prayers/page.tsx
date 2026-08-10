import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedBackendPrayersList } from '@/components/site/LocalizedContent';
import { Eyebrow, Hero, HeroTitle, Lead, Page } from '@/components/site/PageChrome';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'prayersPageTitle'),
    description: translate(locale, 'prayersPageDescription'),
    path: '/prayers',
    locale
  });
}

export default async function PrayersPage() {
  const locale = await getRequestLocale();
  const prayers = await publicApi.prayers(locale);
  const countLabel = locale === 'en'
    ? `${prayers.length} ${prayers.length === 1 ? 'prayer' : 'prayers'}`
    : locale === 'uk'
      ? `${prayers.length} ${prayers.length === 1 ? 'молитва' : 'молитов'}`
      : `${prayers.length} ${prayers.length === 1 ? 'молитва' : 'молитв'}`;
  return (
    <Page>
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navPrayers')}
      />
      <Hero>
        <Eyebrow><T k="prayersPageEyebrow" /></Eyebrow>
        <HeroTitle><T k="prayersPageTitle" /></HeroTitle>
        <Lead>{prayers.length ? countLabel : translate(locale, 'prayersPageDescription')}</Lead>
      </Hero>
      {prayers.length ? <LocalizedBackendPrayersList prayers={prayers} /> : <p className="m-0 border-t border-gold/28 py-6 text-muted-foreground text-[18px]">{translate(locale, 'noDays')}</p>}
    </Page>
  );
}
