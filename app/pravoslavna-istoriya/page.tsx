import { Hreflang } from '@/components/site/Hreflang';
import { HistoryVisualizer } from '@/components/site/visualizer/HistoryVisualizer';
import { listVisualizerEvents } from '@/lib/d1/repositories/visualizerEvents';
import { getBaseEarthModel } from '@/lib/d1/repositories/visualizerModels';
import { applyListLanguageFallback } from '@/lib/church-public/translation-fallback';
import { resolveMediaUrl } from '@/lib/media/resolver';
import { isLocale, translate } from '@/lib/i18n';
import type { ChurchVisualizerEventDto } from '@/lib/types';
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
    listVisualizerEvents({ status: 'published' }),
    getBaseEarthModel()
  ]);
  const publishedEvents = applyListLanguageFallback(events, locale, (item) => item.translationGroupId)
    .flatMap((event): ChurchVisualizerEventDto[] =>
      isLocale(event.language) && event.status === 'published'
        ? [{ ...event, language: event.language, status: event.status }]
        : []
    );

  return (
    <>
      <Hreflang locale={locale} path="/pravoslavna-istoriya" />
      <HistoryVisualizer events={publishedEvents} baseEarthModelUrl={resolveMediaUrl(baseEarthModel?.r2Key) ?? null} />
    </>
  );
}
