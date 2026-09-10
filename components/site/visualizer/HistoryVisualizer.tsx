'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Church, Globe2, History, MapPin, Layers, Sparkles, Menu, X, Plus, Minus, RotateCcw, Maximize, ArrowUpRight, Box, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Dialog, DialogClose, DialogOverlay, DialogPopup, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/components/site/LanguageProvider';
import type { ChurchVisualizerEventDto, PublicChurchVisualizerEventPage } from '@/lib/types';
import { centuryKey, yearKey, centuryText, dateText } from '@/lib/visualizer/chronology';
import { eraLabel } from '@/lib/visualizer/era-labels';
import { sectionEvents, timelineEra, TIMELINE_ERAS, type HistorySection } from '@/lib/visualizer/explorer';
import { explorerMessages } from '@/lib/visualizer/explorer-messages';
import { Earth3DCanvas, type SelectedEventTarget, type CameraCommand } from './Earth3DCanvas';
import styles from './history.module.css';

const datingLabels = { exact: 'historyExactDating', approximate: 'historyApproximateDating', traditional: 'historyTraditionalDating', period: 'historyPeriodDating', unknown: 'historyUnknownDating' } as const;

const sections = [
  ['visualizer', Globe2], ['biblical', BookOpen], ['church', Church], ['saints', Sparkles],
  ['chronology', History], ['map', MapPin], ['collections', Layers]
] as const;

export function HistoryVisualizer({ events, baseEarthModelUrl }: { events: ChurchVisualizerEventDto[]; baseEarthModelUrl: string | null }) {
  const { t, locale } = useI18n();
  const copy = explorerMessages[locale];
  const rootRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState<HistorySection>('visualizer');
  const [era, setEra] = useState('all');
  const [century, setCentury] = useState('all');
  const [year, setYear] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [model, setModel] = useState<{ eventId: string; url: string | null } | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [articleOpen, setArticleOpen] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [bordersVisible, setBordersVisible] = useState(true);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | undefined>();

  const sectionList = useMemo(() => sectionEvents(events, section), [events, section]);
  const eraList = useMemo(() => sectionList.filter((event) => era === 'all' || timelineEra(event.era) === era), [sectionList, era]);
  const centuries = useMemo(() => [...new Map(eraList.map((event) => [centuryKey(event), event])).entries()], [eraList]);
  const centuryList = useMemo(() => eraList.filter((event) => century === 'all' || centuryKey(event) === century), [eraList, century]);
  const years = useMemo(() => [...new Map(centuryList.map((event) => [yearKey(event), event])).entries()], [centuryList]);
  const visibleEvents = useMemo(() => centuryList.filter((event) => year === 'all' || yearKey(event) === year), [centuryList, year]);
  const selectedEvent = events.find((event) => event.id === selectedEventId && event.status === 'published') ?? null;
  const modelUrl = model?.eventId === selectedEventId ? model.url : null;
  const earthTarget = useMemo<SelectedEventTarget>(() => selectedEvent ? {
    latitude: selectedEvent.latitude, longitude: selectedEvent.longitude, modelUrl
  } : null, [selectedEvent, modelUrl]);
  const mapEvents = useMemo(() => visibleEvents.filter((event) => event.latitude != null && event.longitude != null)
    .map((event) => ({ id: event.id, latitude: event.latitude!, longitude: event.longitude!, title: event.title, date: dateText(event, locale) })), [visibleEvents, locale]);

  // Observe actual header size (translations, navigation rows, browser zoom).
  // The CSS fallback handles the first server-rendered frame before hydration.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    const root = rootRef.current;
    if (!header || !root) return;
    const update = () => root.style.setProperty('--history-header-height', `${header.getBoundingClientRect().bottom}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    const controller = new AbortController();
    void fetch(`/api/church/visualizer-events/${encodeURIComponent(selectedEvent.slug)}?language=${selectedEvent.language}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<PublicChurchVisualizerEventPage | null> : null)
      .then((data) => {
        if (!controller.signal.aborted) setModel({ eventId: selectedEvent.id, url: data?.models?.find((item) => !item.isBaseEarth && item.url)?.url ?? null });
      }).catch(() => { /* Text and geographic navigation remain usable. */ });
    return () => controller.abort();
  }, [selectedEvent]);

  useEffect(() => {
    function restore() {
      setExpanded(false); setImmersiveMode(false);
      fullscreenButtonRef.current?.focus();
    }
    function change() { if (!document.fullscreenElement) restore(); }
    function escape(event: KeyboardEvent) {
      // Dialogs own Escape while open; otherwise CSS fullscreen also exits.
      if (event.key === 'Escape' && expanded && !drawerOpen && !eventOpen && !articleOpen && !document.fullscreenElement) restore();
    }
    document.addEventListener('fullscreenchange', change);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('keydown', escape); };
  }, [expanded, drawerOpen, eventOpen, articleOpen]);

  async function toggleFullscreen() {
    if (expanded) {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen().catch(() => {});
      setExpanded(false); setImmersiveMode(false);
      return;
    }
    setImmersiveMode(true); setExpanded(true);
    // The CSS mode also works in iOS browsers and denied API requests.
    try { await rootRef.current?.requestFullscreen?.(); } catch { /* CSS fallback stays active. */ }
  }

  const chooseEvent = useCallback((id: string) => {
    setSelectedEventId(id);
    setModel(null);
    if (window.matchMedia('(max-width: 1199px)').matches) setEventOpen(true);
  }, []);
  function chooseSection(value: HistorySection) {
    setSection(value); setEra('all'); setCentury('all'); setYear('all');
    setSelectedEventId(null); setDrawerOpen(false);
  }
  function resetCamera() { setSelectedEventId(null); setModel(null); setCameraCommand((previous) => ({ action: 'reset', sequence: (previous?.sequence ?? 0) + 1 })); }
  function zoom(action: 'in' | 'out') { setCameraCommand((previous) => ({ action, sequence: (previous?.sequence ?? 0) + 1 })); }
  function focusTimeline() { setEventOpen(false); timelineRef.current?.focus(); }

  const navigation = <nav aria-label={copy.navigation} className={styles.navigation}>
    <p className={styles.eyebrow}>{copy.navigation}</p>
    {sections.map(([value, Icon]) => <button key={value} type="button" title={copy[value]} aria-label={copy[value]} aria-pressed={section === value} onClick={() => chooseSection(value)}>
      <Icon size={18} aria-hidden="true" /><span className={styles.navText}>{copy[value]}</span><ChevronRight size={14} aria-hidden="true" />
    </button>)}
    <div className={styles.navNote}><span className={styles.statusDot} />{copy[section]}<b>{sectionList.length}</b></div>
    {section === 'collections' ? <p className={styles.muted}>{copy.featured}</p> : null}
  </nav>;

  const eventContent = selectedEvent ? <div className={styles.eventContent}>
    <div className={styles.eventPreview} aria-hidden="true"><Globe2 size={70} strokeWidth={0.7} /><span>{eraLabel(selectedEvent.era, locale)}</span></div>
    <p className={styles.eventDate}>{dateText(selectedEvent, locale)}</p>
    <h2>{selectedEvent.title}</h2>
    {selectedEvent.chronologyType in datingLabels ? <p className={styles.dating}>{t(datingLabels[selectedEvent.chronologyType as keyof typeof datingLabels])}</p> : null}
    {selectedEvent.locationName ? <p className={styles.place}><MapPin size={14} aria-hidden="true" />{selectedEvent.locationName}</p> : null}
    <p className={styles.muted}>{selectedEvent.summary}</p>
    {selectedEvent.description ? <button type="button" aria-label={`${copy.more}: ${selectedEvent.title}`} className={styles.primaryButton} onClick={() => { setEventOpen(false); setArticleOpen(true); }}>{copy.more}<ArrowUpRight size={17} aria-hidden="true" /></button> : null}
    <div className={styles.related}>
      {modelUrl ? <button type="button" aria-label={copy.scene} onClick={() => { setEventOpen(false); sceneRef.current?.focus(); }}><Box size={16} aria-hidden="true" />{copy.scene}</button> : null}
      <button type="button" aria-label={copy.chronology} onClick={focusTimeline}><History size={16} aria-hidden="true" />{copy.chronology}</button>
    </div>
  </div> : <div className={styles.emptyEvent}><p>{copy.chooseCompact}</p></div>;

  return <main ref={rootRef} data-history-app data-immersive={immersiveMode} data-expanded={expanded} data-nav-collapsed={navCollapsed} data-empty-timeline={visibleEvents.length === 0} data-event-selected={!!selectedEvent} className={styles.root} aria-label={t('historyPageTitle')}>
    <div className={styles.topbar}>
      <button className={`${styles.iconButton} ${styles.panelToggle}`} type="button" aria-label={copy.menu} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu size={20} /></button>
      <div className={styles.heading}><span className={styles.eyebrow}>{t('historyPageEyebrow')}</span><h1>{t('historyPageTitle')}</h1><p>{t('historyPageDescription')}</p></div>
      <button className={`${styles.iconButton} ${styles.panelToggle}`} type="button" aria-label={copy.eventPanel} aria-expanded={eventOpen} onClick={() => setEventOpen(true)}><BookOpen size={19} /></button>
      <button ref={fullscreenButtonRef} className={styles.fullscreenButton} type="button" aria-label={expanded ? copy.exit : copy.fullscreen} aria-pressed={expanded} onClick={() => void toggleFullscreen()}>
        {expanded ? <X size={19} /> : <Maximize size={19} />}<span>{expanded ? copy.exit : copy.fullscreen}</span>
      </button>
    </div>

    <span className={styles.srOnly} role="status">{expanded ? copy.fullscreenFallback : ''}</span>
    <div className={styles.workspace}>
      <aside className={styles.leftPanel}><div className={styles.collapseBar}><button type="button" aria-label={navCollapsed ? copy.expandNav : copy.collapseNav} title={navCollapsed ? copy.expandNav : copy.collapseNav} aria-expanded={!navCollapsed} onClick={() => setNavCollapsed((value) => !value)}>{navCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</button></div>{navigation}</aside>
      <section ref={sceneRef} tabIndex={-1} className={styles.scene} aria-label={t('historyGlobeLabel')}>
        <Earth3DCanvas baseEarthModelUrl={baseEarthModelUrl} selectedEvent={earthTarget} bordersVisible={bordersVisible} fill showHint={false} cameraCommand={cameraCommand} mapEvents={mapEvents} onSelectEvent={chooseEvent} />
        <div className={styles.sceneControls} role="group" aria-label={copy.scene}>
          <button type="button" className={styles.bordersToggle} aria-pressed={bordersVisible} onClick={() => setBordersVisible((value) => !value)}>{copy.borders}</button>
          <button type="button" aria-label={copy.zoomIn} title={copy.zoomIn} onClick={() => zoom('in')}><Plus size={20} /></button>
          <button type="button" aria-label={copy.zoomOut} title={copy.zoomOut} onClick={() => zoom('out')}><Minus size={20} /></button>
          <button type="button" aria-label={copy.reset} title={copy.reset} onClick={resetCamera}><RotateCcw size={18} /></button>
        </div>
        <p className={styles.sceneHint}>{copy.hint}</p>
      </section>
      <aside className={styles.rightPanel} aria-label={copy.event}>{selectedEvent ? <div className={styles.panelHeading}>{copy.event}<BookOpen size={15} aria-hidden="true" /></div> : null}{eventContent}</aside>
    </div>

    <section ref={timelineRef} className={styles.timeline} aria-label={copy.timeline} tabIndex={-1}>
      <div className={styles.timelineToolbar}>
        <span className={styles.timelineLabel}><History size={15} aria-hidden="true" />{copy.timeline}</span>
        <div className={styles.eraTabs} role="group" aria-label={copy.era}>
          {(['all', ...TIMELINE_ERAS, ...(sectionList.some((event) => timelineEra(event.era) === 'other') ? ['other'] : [])] as const).map((value) => <button key={value} type="button" aria-label={copy[value as keyof typeof copy]} aria-pressed={era === value} onClick={() => { setEra(value); setCentury('all'); setYear('all'); }}>{copy[value as keyof typeof copy]}</button>)}
        </div>
        {section === 'chronology' ? <div className={styles.dateFilters}>
          <select aria-label={copy.century} value={century} onChange={(event) => { setCentury(event.target.value); setYear('all'); }}><option value="all">{copy.century}: {copy.allDates}</option>{centuries.map(([key, event]) => <option key={key} value={key}>{centuryText(event, locale)}</option>)}</select>
          <select aria-label={copy.year} value={year} onChange={(event) => setYear(event.target.value)}><option value="all">{copy.year}: {copy.allDates}</option>{years.map(([key, event]) => <option key={key} value={key}>{dateText(event, locale, false)}</option>)}</select>
        </div> : null}
      </div>
      <div className={styles.eventTrack}>
        {visibleEvents.length ? visibleEvents.map((event) => <button className={styles.eventCard} type="button" key={event.id} aria-label={`${dateText(event, locale)} — ${event.title}`} aria-pressed={event.id === selectedEventId} onClick={() => chooseEvent(event.id)}>
          <span className={styles.timelineDot} aria-hidden="true" /><span className={styles.cardDate}>{dateText(event, locale)}</span>
          <span className={styles.cardBody}><span className={styles.cardIcon} aria-hidden="true">{event.eventType === 'saint' ? <Sparkles size={22} /> : event.eventType === 'biblical' ? <BookOpen size={22} /> : <Church size={22} />}</span><strong>{event.title}</strong></span>
          <span className={styles.srOnly}>{event.locationName}. {event.summary}</span>
        </button>) : <p className={styles.noEvents} role="status">{events.some((event) => event.status === 'published') ? copy.noEvents : copy.notAdded}</p>}
      </div>
    </section>

    <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}><DialogPortal container={rootRef}><DialogOverlay className={styles.backdrop} /><DialogPopup className={styles.drawer}>
      <div className={styles.dialogHeading}><DialogTitle>{copy.navigation}</DialogTitle><DialogClose aria-label={copy.close} className={styles.iconButton}><X size={20} /></DialogClose></div>{navigation}
    </DialogPopup></DialogPortal></Dialog>
    <Dialog open={eventOpen} onOpenChange={setEventOpen}><DialogPortal container={rootRef}><DialogOverlay className={styles.backdrop} /><DialogPopup className={styles.sheet}>
      <div className={styles.dialogHeading}><DialogTitle>{copy.event}</DialogTitle><DialogClose aria-label={copy.close} className={styles.iconButton}><X size={20} /></DialogClose></div>{eventContent}
    </DialogPopup></DialogPortal></Dialog>
    <Dialog open={articleOpen} onOpenChange={setArticleOpen}><DialogPortal container={rootRef}><DialogOverlay className={styles.backdrop} /><DialogPopup className={styles.article}>
      <div className={styles.dialogHeading}><DialogTitle>{selectedEvent?.title ?? copy.read}</DialogTitle><DialogClose aria-label={copy.close} className={styles.iconButton}><X size={20} /></DialogClose></div>
      {selectedEvent ? <article><p className={styles.eventDate}>{dateText(selectedEvent, locale)} · {selectedEvent.locationName}</p><p className={styles.articleText}>{selectedEvent.description}</p></article> : null}
    </DialogPopup></DialogPortal></Dialog>
  </main>;
}
