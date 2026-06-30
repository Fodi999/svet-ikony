import { DailyPrayerCollection, LocalizedPrayersList } from '@/components/site/LocalizedContent';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const metadata = pageMetadata({ title: 'Православные молитвы', description: 'Список молитв для чтения перед иконами.', path: '/prayers' });

export default async function PrayersPage() {
  const locale = await getRequestLocale();
  const icons = await publicApi.icons(locale);
  return (
    <main className="page">
      <section className="page-hero"><p className="eyebrow"><T k="prayersPageEyebrow" /></p><h1><T k="prayersPageTitle" /></h1></section>
      <DailyPrayerCollection />
      <LocalizedPrayersList icons={icons} />
    </main>
  );
}
