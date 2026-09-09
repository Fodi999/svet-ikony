'use client';

import { useEffect, useMemo, useState } from 'react';
import { Page, Hero, Eyebrow, HeroTitle, Lead, Panel } from '@/components/site/PageChrome';
import { useI18n } from '@/components/site/LanguageProvider';
import type { ChurchVisualizerEventDto } from '@/lib/types';
import { centuryKey, yearKey, chronologicalOrder, centuryText, dateText } from '@/lib/visualizer/chronology';
import type { Locale } from '@/lib/i18n';
import { Earth3DCanvas, type SelectedEventTarget } from './Earth3DCanvas';

const ERA_ORDER = [
  'biblical_creation',
  'biblical_old_testament',
  'biblical_new_testament',
  'apostolic',
  'early_church',
  'byzantine',
  'medieval',
  'modern',
  'contemporary',
  'custom'
] as const;

/** Closed enum sets read directly here rather than through messages/*.json,
 * mirroring SlavonicAlphabetPage.tsx's established alternative i18n
 * pattern for content-heavy interactive pages (a local per-locale
 * dictionary) rather than adding ~20 more flat JSON keys for a fixed,
 * small vocabulary. */
const ERA_LABELS: Record<(typeof ERA_ORDER)[number], Record<Locale, string>> = {
  biblical_creation: { uk: 'Створення світу', ru: 'Сотворение мира', en: 'Creation' },
  biblical_old_testament: { uk: 'Старий Заповіт', ru: 'Ветхий Завет', en: 'Old Testament' },
  biblical_new_testament: { uk: 'Новий Заповіт', ru: 'Новый Завет', en: 'New Testament' },
  apostolic: { uk: 'Апостольська доба', ru: 'Апостольская эпоха', en: 'Apostolic Age' },
  early_church: { uk: 'Рання Церква', ru: 'Ранняя Церковь', en: 'Early Church' },
  byzantine: { uk: 'Візантія', ru: 'Византия', en: 'Byzantium' },
  medieval: { uk: 'Середньовіччя', ru: 'Средневековье', en: 'Medieval' },
  modern: { uk: 'Новий час', ru: 'Новое время', en: 'Modern' },
  contemporary: { uk: 'Сучасність', ru: 'Современность', en: 'Contemporary' },
  custom: { uk: 'Інше', ru: 'Прочее', en: 'Other' }
};

function eraLabel(era: string, locale: Locale): string {
  return (ERA_LABELS as Record<string, Record<Locale, string>>)[era]?.[locale] ?? era;
}

function chronologyNoteKey(chronologyType: string): 'historyExactDating' | 'historyTraditionalDating' | 'historyApproximateDating' | 'historyPeriodDating' | 'historyUnknownDating' | null {
  if (chronologyType === 'exact') return 'historyExactDating';
  if (chronologyType === 'traditional') return 'historyTraditionalDating';
  if (chronologyType === 'approximate') return 'historyApproximateDating';
  if (chronologyType === 'period') return 'historyPeriodDating';
  if (chronologyType === 'unknown') return 'historyUnknownDating';
  return null;
}

type Stage = 'era' | 'century' | 'year' | 'event';

export function HistoryVisualizer({ events, baseEarthModelUrl }: { events: ChurchVisualizerEventDto[]; baseEarthModelUrl: string | null }) {
  const { t, locale } = useI18n();
  const [stage, setStage] = useState<Stage>('era');
  const [trail, setTrail] = useState<Stage[]>([]);
  const [selectedEra, setSelectedEra] = useState<string | null>(null);
  const [selectedCentury, setSelectedCentury] = useState<string | undefined>(undefined);
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // The initially-fetched event list has no `models` field (kept small on
  // purpose) -- an event's own GLB (if any) is only known once its detail
  // route is fetched, which only happens on selection, matching the
  // "lazy-load on demand" requirement.
  const [selectedEventModelUrl, setSelectedEventModelUrl] = useState<string | null>(null);

  const eraGroups = useMemo(() => {
    const map = new Map<string, ChurchVisualizerEventDto[]>();
    for (const event of [...events].sort(chronologicalOrder)) {
      const list = map.get(event.era) ?? [];
      list.push(event);
      map.set(event.era, list);
    }
    return ERA_ORDER.filter((era) => map.has(era)).map((era) => ({ era, events: map.get(era)! }));
  }, [events]);

  const centuryGroups = useMemo(() => {
    const eraEvents = eraGroups.find((g) => g.era === selectedEra)?.events ?? [];
    const map = new Map<string, ChurchVisualizerEventDto[]>();
    for (const event of eraEvents) {
      const list = map.get(centuryKey(event)) ?? [];
      list.push(event);
      map.set(centuryKey(event), list);
    }
    return [...map.entries()]
      .sort((a, b) => chronologicalOrder(a[1][0], b[1][0]))
      .map(([century, list]) => ({ century, events: list }));
  }, [eraGroups, selectedEra]);

  const yearGroups = useMemo(() => {
    const centuryEvents = centuryGroups.find((g) => g.century === selectedCentury)?.events ?? [];
    const map = new Map<string, ChurchVisualizerEventDto[]>();
    for (const event of centuryEvents) {
      const list = map.get(yearKey(event)) ?? [];
      list.push(event);
      map.set(yearKey(event), list);
    }
    return [...map.entries()]
      .sort((a, b) => chronologicalOrder(a[1][0], b[1][0]))
      .map(([yearStart, list]) => ({ yearStart, events: list }));
  }, [centuryGroups, selectedCentury]);

  const eventsAtYear = useMemo(
    () => selectedYear === undefined
      ? centuryGroups.find((g) => g.century === selectedCentury)?.events ?? []
      : yearGroups.find((g) => g.yearStart === selectedYear)?.events ?? [],
    [yearGroups, selectedYear, centuryGroups, selectedCentury]
  );

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) ?? null, [events, selectedEventId]);

  const earthTarget = useMemo<SelectedEventTarget>(() => selectedEvent
    ? { latitude: selectedEvent.latitude, longitude: selectedEvent.longitude, modelUrl: selectedEventModelUrl }
    : null, [selectedEvent, selectedEventModelUrl]);

  useEffect(() => {
    if (!selectedEvent) return;
    const controller = new AbortController();
    type DetailResponse = { models?: { isBaseEarth: boolean; url?: string }[] } | null;
    void fetch(`/api/church/visualizer-events/${encodeURIComponent(selectedEvent.slug)}?language=${selectedEvent.language}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<DetailResponse> : null)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSelectedEventModelUrl(data?.models?.find((model) => !model.isBaseEarth && model.url)?.url ?? null);
        }
      })
      .catch(() => { /* The globe and event marker remain available. */ });
    return () => controller.abort();
  }, [selectedEvent]);

  function advance(next: Stage) { setTrail((previous) => [...previous, stage]); setStage(next); }
  function chooseEra(era: string) {
    setSelectedEra(era);
    setSelectedCentury(undefined);
    setSelectedYear(undefined);
    setSelectedEventId(null);
    const undated = (eraGroups.find((group) => group.era === era)?.events ?? []).every((event) => centuryKey(event) === 'undated');
    if (undated) setSelectedCentury('undated');
    advance(undated ? 'event' : 'century');
  }
  function chooseCentury(century: string) {
    setSelectedCentury(century);
    setSelectedYear(undefined);
    setSelectedEventId(null);
    const undated = (centuryGroups.find((group) => group.century === century)?.events ?? []).every((event) => event.yearStart == null);
    advance(undated ? 'event' : 'year');
  }
  function chooseYear(yearStart: string) {
    setSelectedYear(yearStart);
    setSelectedEventId(null);
    advance('event');
  }
  function chooseEvent(id: string) {
    setSelectedEventId(id);
    setSelectedEventModelUrl(null);
  }
  function goBack() {
    setStage(trail.at(-1) ?? 'era');
    setTrail((previous) => previous.slice(0, -1));
    setSelectedEventId(null);
    setSelectedEventModelUrl(null);
  }

  const optionButtonClass =
    'relative inline-flex min-h-11 items-center rounded-sm border border-gold/28 bg-[#141511] px-4 text-[14px] font-extrabold text-muted-foreground cursor-pointer transition-[border-color,color,background] duration-[180ms] ease-brand hover:border-gold hover:text-foreground';

  return (
    <Page>
      <Hero>
        <Eyebrow>{t('historyPageEyebrow')}</Eyebrow>
        <HeroTitle>{t('historyPageTitle')}</HeroTitle>
        <Lead>{t('historyPageDescription')}</Lead>
      </Hero>

      <Earth3DCanvas baseEarthModelUrl={baseEarthModelUrl} selectedEvent={earthTarget} />

      <div className="mt-[clamp(22px,3vw,38px)] grid grid-cols-[minmax(280px,1fr)_minmax(320px,420px)] gap-[clamp(18px,2.5vw,32px)] max-[900px]:grid-cols-1">
        <section>
          {stage !== 'era' ? (
            <button type="button" className={`${optionButtonClass} mb-4`} onClick={goBack}>
              ← {t('historyBack')}
            </button>
          ) : null}

          {stage === 'era' ? (
            <>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[.12em] text-muted-foreground">{t('historyChooseEra')}</p>
              <div className="flex flex-wrap gap-2.5">
                {eraGroups.length ? (
                  eraGroups.map(({ era, events: eraEvents }) => (
                    <button key={era} type="button" className={optionButtonClass} onClick={() => chooseEra(era)}>
                      {eraLabel(era, locale)} ({eraEvents.length})
                    </button>
                  ))
                ) : (
                  <p className="text-muted-foreground">{t('historyNoEvents')}</p>
                )}
              </div>
            </>
          ) : null}

          {stage === 'century' ? (
            <>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[.12em] text-muted-foreground">{t('historyChooseCentury')}</p>
              <div className="flex flex-wrap gap-2.5">
                {centuryGroups.map(({ century, events: centuryEvents }) => (
                  <button key={String(century)} type="button" className={optionButtonClass} onClick={() => chooseCentury(century)}>
                    {centuryText(centuryEvents[0], locale)} ({centuryEvents.length})
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {stage === 'year' ? (
            <>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[.12em] text-muted-foreground">{t('historyChooseYear')}</p>
              <div className="flex flex-wrap gap-2.5">
                {yearGroups.map(({ yearStart, events: yearEvents }) => (
                  <button key={String(yearStart)} type="button" className={optionButtonClass} onClick={() => chooseYear(yearStart)}>
                    {dateText(yearEvents[0], locale, false)} ({yearEvents.length})
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {stage === 'event' ? (
            <>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[.12em] text-muted-foreground">{t('historyChooseEvent')}</p>
              <div className="flex flex-wrap gap-2.5">
                {eventsAtYear.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`${optionButtonClass} ${selectedEventId === event.id ? 'border-gold bg-gold/14 text-gold-light' : ''}`}
                    onClick={() => chooseEvent(event.id)}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <Panel className="border border-gold/28 rounded-[8px] bg-[#141511] p-5">
          {selectedEvent ? (
            <div className="grid gap-2.5">
              <h2 className="m-0 font-serif text-[clamp(22px,2vw,30px)] font-bold text-foreground">{selectedEvent.title}</h2>
              <p className="m-0 text-muted-foreground text-[13px] font-black uppercase tracking-[.08em]">
                {t('historyDateLabel')}: {dateText(selectedEvent, locale)}
              </p>
              {selectedEvent.locationName ? (
                <p className="m-0 text-muted-foreground text-[13px] font-black uppercase tracking-[.08em]">
                  {t('historyPlaceLabel')}: {selectedEvent.locationName}
                </p>
              ) : null}
              {chronologyNoteKey(selectedEvent.chronologyType) ? (
                <p className="m-0 inline-flex w-fit items-center rounded-full border border-gold/28 px-3 py-1 text-gold-light text-[11px] font-black uppercase tracking-[.08em]">
                  {t(chronologyNoteKey(selectedEvent.chronologyType)!)}
                </p>
              ) : null}
              {selectedEvent.summary ? <p className="m-0 text-muted-foreground leading-[1.5]">{selectedEvent.summary}</p> : null}
              {selectedEvent.description ? <p className="m-0 text-foreground leading-[1.6]">{selectedEvent.description}</p> : null}
            </div>
          ) : (
            <p className="m-0 text-muted-foreground">{t('historyChooseEvent')}</p>
          )}
        </Panel>
      </div>
    </Page>
  );
}
