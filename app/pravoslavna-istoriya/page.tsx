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
import { headers } from 'next/headers';
import { resolveVisualizerEngine } from '@/lib/cesium/local-mode';
import {CalendarExperience} from '@/components/site/visualizer-cesium/CalendarExperience';

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'historyPageTitle'),
    description: translate(locale, 'historyPageDescription'),
    path: '/pravoslavna-istoriya',
    locale
  });
}

export default async function PravoslavnaIstoriyaPage({ searchParams }: { searchParams: Promise<{ terrainRegion?: string; engine?:string;view?:string }> }) {
  const locale = await getRequestLocale();
  const useLocalEarthPreview = process.env.NODE_ENV === 'development' && process.env.EARTH_ASSET_MODE === 'local';
  const host = (await headers()).get('host') ?? '';
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const params=await searchParams;
  if(process.env.NODE_ENV==='development'&&localHost)return <CalendarExperience/>;
  const engine=process.env.NODE_ENV === 'production'
    ? (params.engine === 'three' ? 'three' : 'cesium')
    : resolveVisualizerEngine(process.env.NODE_ENV,host,params.engine ?? process.env.VISUALIZER_ENGINE);
  const initialAlpsPreview = useLocalEarthPreview && localHost && params.terrainRegion === 'alps';
  const [events, baseEarthModel] = useLocalEarthPreview ? [[], null] : await Promise.all([
    listVisualizerEvents({ status: 'published' }),
    getBaseEarthModel()
  ]);
  const publishedEvents = applyListLanguageFallback(events, locale, (item) => item.translationGroupId)
    .flatMap((event): ChurchVisualizerEventDto[] =>
      isLocale(event.language) && event.status === 'published'
        ? [{ ...event, language: event.language, status: event.status }]
        : []
    );

  // Phase C: EARTH_ASSET_MODE=local lets a locally Blender-exported GLB be
  // previewed without touching R2/D1 -- gated on NODE_ENV so a stray env
  // var can never divert production away from the real Base Earth Model
  // (the /api/dev/earth-preview route independently re-checks this too).
  // See EARTH_ASSET_CONTRACT.md.
  const baseEarthModelUrl = useLocalEarthPreview ? '/api/dev/earth-preview' : resolveMediaUrl(baseEarthModel?.r2Key) ?? null;

  return (
    <>
      <Hreflang locale={locale} path="/pravoslavna-istoriya" />
      <HistoryVisualizer events={publishedEvents} baseEarthModelUrl={baseEarthModelUrl} initialAlpsPreview={initialAlpsPreview} engine={engine} />
    </>
  );
}
