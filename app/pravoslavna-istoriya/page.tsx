import { Hreflang } from '@/components/site/Hreflang';
import { HistoryVisualizer } from '@/components/site/visualizer/HistoryVisualizer';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'historyPageTitle'),
    description: translate(locale, 'historyPageDescription'),
    path: '/pravoslavna-istoriya',
    locale
  });
}

export default async function PravoslavnaIstoriyaPage() {
  const locale = await getRequestLocale();
  const [events, baseEarthModel] = await Promise.all([
    publicApi.churchVisualizerEventList(locale),
    publicApi.churchVisualizerBaseEarthModel()
  ]);
  const publishedEvents = events.filter((item) => item.status === 'published');

  return (
    <>
      <Hreflang locale={locale} path="/pravoslavna-istoriya" />
      <HistoryVisualizer events={publishedEvents} baseEarthModelUrl={baseEarthModel?.url ?? null} />
    </>
  );
}
