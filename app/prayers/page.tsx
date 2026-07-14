import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedBackendPrayersList } from '@/components/site/LocalizedContent';
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
  return (
    <main className="page">
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navPrayers')}
      />
      <section className="page-hero"><p className="eyebrow"><T k="prayersPageEyebrow" /></p><h1><T k="prayersPageTitle" /></h1></section>
      <LocalizedBackendPrayersList prayers={prayers} />
    </main>
  );
}
