'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CalendarContent, CalendarServiceCard as CalendarService, Icon, Prayer, PublicChurchContentPage, SeoPage } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import { buildCalendarHero, calendarDayFromChurchPage, dedupeCalendarDaysByDay } from '@/lib/api';
import { type TranslationKey } from '@/lib/i18n';
import {
  CalendarFeatureCard,
  CalendarGridDay,
  CalendarImageCard,
  CalendarInfoCard,
  CalendarListDay,
  CalendarServiceCard,
  type CalendarDay
} from './CalendarCards';
import { SvgIcon } from './SvgIcon';

type DayKind = CalendarDay['kind'];
type FilterKind = 'all' | DayKind;
type ViewMode = 'calendar' | 'list';
type CalendarPosition = { year: number; monthIndex: number };

const months = [
  { key: 'monthJanuary', ruTitle: 'Январь', days: 31 },
  { key: 'monthFebruary', ruTitle: 'Февраль', days: 28 },
  { key: 'monthMarch', ruTitle: 'Март', days: 31 },
  { key: 'monthApril', ruTitle: 'Апрель', days: 30 },
  { key: 'monthMay', ruTitle: 'Май', days: 31 },
  { key: 'monthJune', ruTitle: 'Июнь', days: 30 },
  { key: 'monthJuly', ruTitle: 'Июль', days: 31 },
  { key: 'monthAugust', ruTitle: 'Август', days: 31 },
  { key: 'monthSeptember', ruTitle: 'Сентябрь', days: 30 },
  { key: 'monthOctober', ruTitle: 'Октябрь', days: 31 },
  { key: 'monthNovember', ruTitle: 'Ноябрь', days: 30 },
  { key: 'monthDecember', ruTitle: 'Декабрь', days: 31 }
] as const satisfies Array<{ key: TranslationKey; ruTitle: string; days: number }>;

const weekdayKeys: TranslationKey[] = ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'];

const filterLabelKeys: Record<FilterKind, TranslationKey> = {
  all: 'allDays',
  feast: 'feastIcons',
  fast: 'fastSpecial',
  gospel: 'gospel',
  prayer: 'prayers',
  quiet: 'quietDays'
};

function calendarCacheKey(year: number, monthIndex: number, locale: string) {
  return `${locale}-${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function monthFromAbsolute(absoluteMonth: number) {
  return {
    year: Math.floor(absoluteMonth / 12),
    monthIndex: ((absoluteMonth % 12) + 12) % 12
  };
}

function parseCalendarQueryPosition(yearValue: string | null, monthValue: string | null): CalendarPosition | null {
  const queryYear = Number(yearValue);
  const queryMonth = Number(monthValue);
  if (!Number.isFinite(queryYear) || !Number.isFinite(queryMonth) || queryMonth < 1 || queryMonth > 12) return null;
  return { year: queryYear, monthIndex: queryMonth - 1 };
}

function normalizeLookup(value?: string) {
  return (value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-яіїєґ0-9]+/gi, ' ').trim();
}

function findCalendarIcon(icons: Icon[], day: CalendarContent['days'][number]) {
  const detailSlug = day.detailHref?.split('/').filter(Boolean).pop();
  const label = normalizeLookup(day.label);

  return (
    icons.find((icon) => icon.slug === day.iconSlug) ||
    icons.find((icon) => detailSlug && icon.slug === detailSlug) ||
    icons.find((icon) => {
      const title = normalizeLookup(icon.title);
      return Boolean(label && title && (title.includes(label.slice(0, 22)) || label.includes(title.slice(0, 22))));
    })
  );
}

function slugFromHref(href?: string) {
  return href?.split('/').filter(Boolean).pop() || '';
}

function pageHrefForDay(item: CalendarDay, pages: SeoPage[] = []) {
  if (item.icon?.source === 'church') return item.detailHref || `/icons/${item.icon.slug}`;

  const hrefSlug = slugFromHref(item.detailHref);
  const hasIconPage = Boolean(item.icon?.slug);
  const seoPage = pages.find((page) => page.slug === hrefSlug);

  if (hasIconPage) return `/icons/${item.icon?.slug}`;
  if (seoPage) return `/p/${seoPage.slug}`;
  if (item.detailHref && !item.detailHref.startsWith('/icons/')) return item.detailHref;
  if (hrefSlug) return `/p/${hrefSlug}`;
  return '/icons';
}

function fillMonthDays(days: CalendarDay[], totalDays: number) {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const filled = Array.from({ length: totalDays }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return byDay.get(day) ?? { day, label: '', note: '', kind: 'quiet' as DayKind, textOnly: true };
  });

  return filled.sort((left, right) => Number(left.day) - Number(right.day));
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function createMonthDays(icons: Icon[], calendar: CalendarContent | undefined, totalDays: number): CalendarDay[] {
  if (calendar?.days?.length) {
    return fillMonthDays(calendar.days.map((day) => {
      const icon = findCalendarIcon(icons, day);

      return {
        day: day.day,
        gregorianDate: day.gregorianDate,
        julianDay: day.julianDay,
        julianDate: day.julianDate,
        label: day.label,
        note: day.note,
        kind: day.kind,
        imageUrl: day.imageUrl,
        icon,
        prayerSlug: day.prayerSlug,
        gospelSlug: day.gospelSlug,
        detailHref: day.detailHref,
        current: day.current,
        feast: day.feast,
        textOnly: day.textOnly,
        description: day.description
      };
    }), totalDays);
  }

  return createQuietMonth(totalDays);
}

function createQuietMonth(totalDays: number): CalendarDay[] {
  return fillMonthDays([], totalDays);
}

function collectCalendarImageUrls(calendar: CalendarContent | undefined, icons: Icon[]) {
  if (!calendar) return [];
  const monthIndex = monthIndexFromTitle(calendar.hero?.monthTitle);
  const year = Number(calendar.hero?.year) || new Date().getFullYear();
  const days = createMonthDays(icons, calendar, getDaysInMonth(year, monthIndex));
  return Array.from(new Set([
    ...days.map((day) => day.imageUrl || day.icon?.imageUrl || ''),
    icons.find((icon) => icon.slug === calendar.hero?.iconDayIconSlug)?.imageUrl || ''
  ].filter(Boolean)));
}

function preloadImages(urls: string[], preloaded?: Set<string>) {
  if (typeof window === 'undefined') return;
  urls.forEach((url) => {
    if (preloaded?.has(url)) return;
    preloaded?.add(url);
    const image = new window.Image();
    image.decoding = 'async';
    image.src = url;
  });
}

function getMondayStartOffset(year: number, monthIndex: number) {
  return (new Date(year, monthIndex, 1).getDay() + 6) % 7;
}

function calendarCellKey(item: CalendarDay, year: number, monthIndex: number) {
  const source = normalizeLookup(item.detailHref || item.icon?.slug || item.prayerSlug || item.gospelSlug || item.label || item.kind).replace(/\s+/g, '-');
  if (!item.outOfMonth) return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${item.day}-${source || item.kind}`;

  const offset = item.monthKey ? months.findIndex((month) => month.key === item.monthKey) : monthIndex;
  const cellMonthIndex = offset >= 0 ? offset : monthIndex;
  const cellYear = monthIndex === 0 && cellMonthIndex === 11
    ? year - 1
    : monthIndex === 11 && cellMonthIndex === 0
      ? year + 1
      : year;
  return `${cellYear}-${String(cellMonthIndex + 1).padStart(2, '0')}-${item.day}-outside`;
}

function createCalendarGridDays(days: CalendarDay[], monthIndex: number, year: number): CalendarDay[] {
  const offset = getMondayStartOffset(year, monthIndex);
  const previousMonthIndex = (monthIndex + 11) % 12;
  const nextMonthIndex = (monthIndex + 1) % 12;
  const previousMonthYear = monthIndex === 0 ? year - 1 : year;
  const previousMonth = months[previousMonthIndex];
  const nextMonth = months[nextMonthIndex];
  const previousMonthDays = getDaysInMonth(previousMonthYear, previousMonthIndex);
  const leading = Array.from({ length: offset }, (_, index) => {
    const day = String(previousMonthDays - offset + index + 1).padStart(2, '0');
    return { day, label: '', note: '', kind: 'quiet' as DayKind, textOnly: true, outOfMonth: true, monthKey: previousMonth.key };
  });
  const current = days.map((day) => ({ ...day, outOfMonth: false, monthKey: months[monthIndex].key }));
  const trailingCount = (7 - ((leading.length + current.length) % 7)) % 7;
  const trailing = Array.from({ length: trailingCount }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return { day, label: '', note: '', kind: 'quiet' as DayKind, textOnly: true, outOfMonth: true, monthKey: nextMonth.key };
  });

  return [...leading, ...current, ...trailing];
}

function monthIndexFromTitle(title?: string) {
  const normalized = normalizeLookup(title);
  const index = months.findIndex((month) => normalized.includes(normalizeLookup(month.ruTitle)));
  return index >= 0 ? index : 0;
}

function calendarPositionFromContent(calendar: CalendarContent | undefined): CalendarPosition {
  const today = new Date();
  return {
    year: Number(calendar?.hero?.year) || today.getFullYear(),
    monthIndex: calendar?.hero?.monthTitle ? monthIndexFromTitle(calendar.hero.monthTitle) : today.getMonth()
  };
}

function dayDateLabel(item: CalendarDay) {
  if (item.gregorianDate && item.julianDate) return `${item.gregorianDate} / ${item.julianDate} ст. ст.`;
  if (item.julianDate) return `${item.julianDate} ст. ст.`;
  return '';
}

function formatCalendarDate(date: Date, locale: string) {
  const localeCode = locale === 'en' ? 'en-US' : locale === 'uk' ? 'uk-UA' : 'ru-RU';
  return new Intl.DateTimeFormat(localeCode, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/**
 * Stage 2E: was a direct fetch to the old Koyeb backend's `/api/content`
 * (an aggregate SiteContent with a `calendar` field). That endpoint had no
 * D1 equivalent (see lib/api.ts's own doc comment on `apiGet`), so this now
 * calls this same Worker's local `/api/church/calendar` (relative URL —
 * this runs in the browser, same-origin is exactly right) and composes a
 * `CalendarContent` client-side with the same helpers `publicApi.content()`
 * uses server-side, so both code paths produce an identical shape.
 */
async function fetchCalendarContent(year: number, monthIndex: number, locale: string, signal: AbortSignal): Promise<CalendarContent | undefined> {
  const month = monthIndex + 1;
  const query = new URLSearchParams({ year: String(year), month: String(month), language: locale });
  const response = await fetch(`/api/church/calendar?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Calendar content is not available');
  const pages = (await response.json()) as PublicChurchContentPage[];
  return { hero: buildCalendarHero(year, month), days: dedupeCalendarDaysByDay(pages.map(calendarDayFromChurchPage)), services: [] };
}

function localizedHeroTitle(title: string | undefined, t: (key: TranslationKey) => string) {
  const normalized = normalizeLookup(title);
  if (
    !normalized ||
    normalized === normalizeLookup('СВЕТ ИКОН') ||
    normalized === normalizeLookup('Свет Иконы') ||
    normalized === normalizeLookup('Світ Ікони')
  ) return t('svetIkony');
  return title;
}

function localizedHeroText(value: string | undefined, fallbackKey: TranslationKey, t: (key: TranslationKey) => string) {
  const normalized = normalizeLookup(value);
  const known: Array<[TranslationKey, string[]]> = [
    ['saintVasily', ['Святитель Василий Великий', 'Святитель Василій Великий']],
    ['saintMemory', ['Память святого', 'Пам’ять святого', 'Память святого']],
    ['jan14Old', ['14 января (ст. ст.)', '14 січня (ст. ст.)']],
    ['jan14', ['14 января 2026', '14 січня 2026']],
    ['saintNicholasIcon', ['Икона святителя Николая Чудотворца', 'Ікона святителя Миколая Чудотворця']],
    ['currentFeast', ['Сегодняшний праздник', 'Сьогоднішнє свято']],
    ['importantDay', ['Важный день', 'Важливий день']]
  ];
  const match = known.find(([, variants]) => variants.some((item) => normalizeLookup(item) === normalized));
  if (match) return t(match[0]);
  return value || t(fallbackKey);
}

function serviceTranslationKeys(service: CalendarService): [TranslationKey, TranslationKey] | null {
  const normalizedTitle = normalizeLookup(service.title);
  const normalizedHref = normalizeLookup(service.href);
  const id = normalizeLookup(service.id);

  if (id.includes('prayers') || normalizedHref === 'prayers' || normalizedTitle.includes('молит')) {
    return ['calendarServicePrayersTitle', 'calendarServicePrayersText'];
  }
  if (id.includes('gospel') || normalizedHref === 'gospel' || normalizedTitle.includes('евангел')) {
    return ['calendarServiceGospelTitle', 'calendarServiceGospelText'];
  }
  if (id.includes('feasts') || normalizedHref.includes('pravoslavnaya ikona s qr kodom') || normalizedTitle.includes('праздник') || normalizedTitle.includes('пост')) {
    return ['calendarServiceFeastsTitle', 'calendarServiceFeastsText'];
  }
  if (id.includes('icons') || normalizedHref === 'icons' || normalizedTitle.includes('икон')) {
    return ['calendarServiceIconsTitle', 'calendarServiceIconsText'];
  }

  return null;
}

function localizeService(service: CalendarService, t: (key: TranslationKey) => string): CalendarService {
  const keys = serviceTranslationKeys(service);
  if (!keys) return service;
  return {
    ...service,
    title: t(keys[0]),
    description: t(keys[1])
  };
}

export function CalendarView({ icons, prayers, pages = [], calendar }: { icons: Icon[]; prayers: Prayer[]; pages?: SeoPage[]; calendar?: CalendarContent }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // useSearchParams() can return a new object reference on every render even
  // when the actual query string hasn't changed. Putting that object
  // straight into a dependency array made both sync effects below re-run
  // (and re-fire router.replace()) far more often than the URL actually
  // changed — the primitive string/values here are what the effects should
  // actually depend on.
  const searchParamsString = searchParams.toString();
  const searchYear = searchParams.get('year');
  const searchMonth = searchParams.get('month');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [view, setView] = useState<ViewMode>('calendar');
  const [expandedDay, setExpandedDay] = useState('');
  const [activeCalendar, setActiveCalendar] = useState(calendar);
  const initialPosition = parseCalendarQueryPosition(searchYear, searchMonth) ?? calendarPositionFromContent(calendar);
  const [year, setYear] = useState(initialPosition.year);
  const [monthIndex, setMonthIndex] = useState(initialPosition.monthIndex);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [monthTransition, setMonthTransition] = useState(false);
  const [monthDirection, setMonthDirection] = useState<'next' | 'prev'>('next');
  const calendarCache = useRef(new Map<string, CalendarContent>());
  const preloadedImages = useRef(new Set<string>());
  const previousAbsoluteMonth = useRef(year * 12 + monthIndex);
  const pendingLocalMonth = useRef<string | null>(null);
  const activeCalendarYear = Number(activeCalendar?.hero?.year) || 0;
  const activeCalendarMonth = monthIndexFromTitle(activeCalendar?.hero?.monthTitle);
  const selectedCalendar = activeCalendarYear === year && activeCalendarMonth === monthIndex ? activeCalendar : undefined;
  const hero = selectedCalendar?.hero;
  const monthDaysTotal = getDaysInMonth(year, monthIndex);
  const showMonthPlaceholder = !selectedCalendar && Boolean(activeCalendar || calendarLoading);
  const days = useMemo(
    () => showMonthPlaceholder ? createQuietMonth(monthDaysTotal) : createMonthDays(icons, selectedCalendar, monthDaysTotal),
    [icons, selectedCalendar, monthDaysTotal, showMonthPlaceholder]
  );
  const calendarGridDays = useMemo(() => createCalendarGridDays(days, monthIndex, year), [days, monthIndex, year]);
  const visibleDays = filter === 'all' ? (view === 'calendar' ? calendarGridDays : days) : days.filter((day) => day.kind === filter);
  const now = new Date();
  const realTodayDay = String(now.getDate()).padStart(2, '0');
  const isCurrentVisibleMonth = now.getFullYear() === year && now.getMonth() === monthIndex;
  const today = days.find((day) => day.current)
    ?? (now.getFullYear() === year && now.getMonth() === monthIndex ? days.find((day) => day.day === String(now.getDate()).padStart(2, '0')) : undefined)
    ?? days.find((day) => day.label)
    ?? days[0];
  const heroToday = (isCurrentVisibleMonth ? days.find((day) => day.day === realTodayDay) : undefined)
    ?? today
    ?? days[0];
  const heroTodayHref = pageHrefForDay(heroToday, pages);
  const heroTodayDate = heroToday?.gregorianDate || formatCalendarDate(now, locale);
  const heroTodayOldDate = heroToday?.julianDate ? `${heroToday.julianDate} ст. ст.` : '';
  const prevMonth = months[(monthIndex + 11) % 12];
  const nextMonth = months[(monthIndex + 1) % 12];
  const monthTitle = `${t(months[monthIndex].key)} ${year}`;
  const iconOfDay = showMonthPlaceholder ? undefined : heroToday?.icon ?? icons.find((icon) => icon.slug === hero?.iconDayIconSlug);
  const prayerOfDay = prayers.find((prayer) => prayer.slug === heroToday?.prayerSlug)
    ?? prayers.find((prayer) => prayer.slug === hero?.iconDayPrayerSlug);
  const navigationTips = [
    { href: '/prayers', label: t('navPrayers'), text: t('prayerDay') },
    { href: '/gospel', label: t('navGospel'), text: t('gospelDay'), tone: 'red' as const },
    { href: '/icons', label: t('navIcons'), text: t('iconOfDay') }
  ];
  const dayActionLabels = {
    prayers: t('prayers'),
    gospel: t('gospel'),
    more: t('more')
  };
  const services = (selectedCalendar?.services?.length ? selectedCalendar.services : [
    { id: 'service-prayers', index: '01', title: t('calendarServicePrayersTitle'), description: t('calendarServicePrayersText'), href: '/prayers' },
    { id: 'service-gospel', index: '02', title: t('calendarServiceGospelTitle'), description: t('calendarServiceGospelText'), href: '/gospel' },
    { id: 'service-feasts', index: '03', title: t('calendarServiceFeastsTitle'), description: t('calendarServiceFeastsText'), href: '/icons' },
    { id: 'service-icons', index: '04', title: t('calendarServiceIconsTitle'), description: t('calendarServiceIconsText'), href: '/icons' }
  ]).map((service) => localizeService(service, t));

  useEffect(() => {
    if (!calendar) return;
    const { year: calendarYear, monthIndex: calendarMonthIndex } = calendarPositionFromContent(calendar);
    const key = calendarCacheKey(calendarYear, calendarMonthIndex, locale);
    calendarCache.current.set(key, calendar);
    if (calendarYear === year && calendarMonthIndex === monthIndex) {
      setActiveCalendar((current) => current === calendar ? current : calendar);
    }
  }, [calendar, locale, monthIndex, year]);

  useEffect(() => {
    const queryPosition = parseCalendarQueryPosition(searchYear, searchMonth);
    if (!queryPosition) return;

    const queryKey = calendarCacheKey(queryPosition.year, queryPosition.monthIndex, locale);
    const stateKey = calendarCacheKey(year, monthIndex, locale);
    if (queryKey === stateKey) {
      pendingLocalMonth.current = null;
      return;
    }
    if (pendingLocalMonth.current === stateKey) return;

    const currentAbsolute = year * 12 + monthIndex;
    const nextAbsolute = queryPosition.year * 12 + queryPosition.monthIndex;
    setMonthDirection(nextAbsolute >= currentAbsolute ? 'next' : 'prev');
    pendingLocalMonth.current = null;
    setYear(queryPosition.year);
    setMonthIndex(queryPosition.monthIndex);
  }, [locale, monthIndex, searchYear, searchMonth, year]);

  useEffect(() => {
    const key = calendarCacheKey(year, monthIndex, locale);
    const cachedCalendar = calendarCache.current.get(key);
    if (cachedCalendar) {
      setActiveCalendar(cachedCalendar);
      setCalendarLoading(false);
      preloadImages(collectCalendarImageUrls(cachedCalendar, icons), preloadedImages.current);
      return;
    }

    const controller = new AbortController();
    setCalendarLoading(true);
    fetchCalendarContent(year, monthIndex, locale, controller.signal)
      .then((nextCalendar) => {
        if (!nextCalendar) return;
        calendarCache.current.set(key, nextCalendar);
        setActiveCalendar(nextCalendar);
        preloadImages(collectCalendarImageUrls(nextCalendar, icons), preloadedImages.current);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false);
      });
    return () => controller.abort();
  }, [icons, locale, monthIndex, year]);

  useEffect(() => {
    const controllers: AbortController[] = [];

    [-1, 1].forEach((delta) => {
      const adjacent = monthFromAbsolute(year * 12 + monthIndex + delta);
      const key = calendarCacheKey(adjacent.year, adjacent.monthIndex, locale);
      const cachedCalendar = calendarCache.current.get(key);

      if (cachedCalendar) {
        preloadImages(collectCalendarImageUrls(cachedCalendar, icons), preloadedImages.current);
        return;
      }

      const controller = new AbortController();
      controllers.push(controller);
      fetchCalendarContent(adjacent.year, adjacent.monthIndex, locale, controller.signal)
        .then((nextCalendar) => {
          if (!nextCalendar) return;
          calendarCache.current.set(key, nextCalendar);
          preloadImages(collectCalendarImageUrls(nextCalendar, icons), preloadedImages.current);
        })
        .catch(() => undefined);
    });

    return () => controllers.forEach((controller) => controller.abort());
  }, [icons, locale, monthIndex, year]);

  useEffect(() => {
    const nextAbsolute = year * 12 + monthIndex;
    const previousAbsolute = previousAbsoluteMonth.current;
    if (nextAbsolute === previousAbsolute) return;

    setMonthDirection(nextAbsolute > previousAbsolute ? 'next' : 'prev');
    setMonthTransition(true);
    previousAbsoluteMonth.current = nextAbsolute;
    const timeout = window.setTimeout(() => setMonthTransition(false), 230);
    return () => window.clearTimeout(timeout);
  }, [monthIndex, year]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    params.set('year', String(year));
    params.set('month', String(monthIndex + 1));
    const nextSearch = params.toString();
    // Compare the fully-resolved target query string, not individual keys —
    // this is what actually stops a redundant router.replace() (and the RSC
    // round-trip it triggers) from firing every time this effect re-runs
    // for an unrelated reason (e.g. `locale` or `pathname` identity).
    if (nextSearch === searchParamsString) {
      pendingLocalMonth.current = null;
      return;
    }

    const stateKey = calendarCacheKey(year, monthIndex, locale);
    const queryPosition = parseCalendarQueryPosition(searchYear, searchMonth);
    const queryKey = queryPosition ? calendarCacheKey(queryPosition.year, queryPosition.monthIndex, locale) : null;
    if (queryKey && queryKey !== stateKey && pendingLocalMonth.current !== stateKey) return;

    pendingLocalMonth.current = stateKey;
    router.replace(`${pathname}?${nextSearch}`, { scroll: false });
  }, [locale, monthIndex, pathname, router, searchMonth, searchParamsString, searchYear, year]);

  function moveMonth(delta: number) {
    const absoluteMonth = year * 12 + monthIndex + delta;
    const next = monthFromAbsolute(absoluteMonth);
    const cachedCalendar = calendarCache.current.get(calendarCacheKey(next.year, next.monthIndex, locale));
    setMonthDirection(delta >= 0 ? 'next' : 'prev');
    pendingLocalMonth.current = calendarCacheKey(next.year, next.monthIndex, locale);
    if (cachedCalendar) setActiveCalendar(cachedCalendar);
    setYear(next.year);
    setMonthIndex(next.monthIndex);
  }

  function moveYear(delta: number) {
    const nextYear = year + delta;
    pendingLocalMonth.current = calendarCacheKey(nextYear, monthIndex, locale);
    setMonthDirection(delta >= 0 ? 'next' : 'prev');
    setYear(nextYear);
  }

  function setCalendarYear(nextYear: number) {
    pendingLocalMonth.current = calendarCacheKey(nextYear, monthIndex, locale);
    setMonthDirection(nextYear >= year ? 'next' : 'prev');
    setYear(nextYear);
  }

  const monthSwapClass = monthTransition
    ? monthDirection === 'prev'
      ? 'animate-[calendarMonthSwapPrev_220ms_ease_both]'
      : 'animate-[calendarMonthSwap_220ms_ease_both]'
    : '';

  return (
    <section className="w-full min-h-screen m-0 p-[clamp(18px,2.4vw,42px)] bg-canvas text-foreground max-[900px]:pt-[18px] max-[900px]:px-[14px] max-[900px]:pb-[38px] max-[520px]:pt-[14px] max-[520px]:px-[10px] max-[520px]:pb-[32px] max-[430px]:pt-[12px] max-[430px]:px-[8px] max-[430px]:pb-[28px] [@media(display-mode:standalone)]:pr-[max(clamp(10px,5vw,72px),env(safe-area-inset-right))] [@media(display-mode:standalone)]:pb-[max(clamp(28px,5vw,92px),env(safe-area-inset-bottom))] [@media(display-mode:standalone)]:pl-[max(clamp(10px,5vw,72px),env(safe-area-inset-left))]">
      <section className="grid grid-cols-[minmax(0,1fr)_minmax(260px,.72fr)_minmax(300px,.92fr)_minmax(260px,.72fr)] items-start gap-[clamp(20px,2vw,32px)] border-b border-gold/28 pb-[clamp(34px,4vw,64px)] max-[1280px]:grid-cols-2 max-[1280px]:gap-[18px] max-[900px]:grid-cols-1 max-[900px]:gap-4 max-[900px]:pb-[26px]">
        <div className="min-w-0 max-[1280px]:col-span-full">
          <span className="block mb-1.5 text-muted-foreground text-[clamp(14px,1.05vw,20px)] font-medium max-[520px]:text-[14px]">{hero?.year ?? String(year)}</span>
          <h1 className="m-0 max-w-[780px] font-serif font-bold leading-none text-foreground text-[clamp(56px,7.6vw,132px)] max-[900px]:max-w-full max-[900px]:text-[clamp(48px,12vw,84px)] max-[900px]:leading-none max-[900px]:[overflow-wrap:anywhere] max-[520px]:text-[clamp(42px,16vw,64px)] max-[520px]:leading-[.98] max-[520px]:text-balance">
            {localizedHeroTitle(hero?.title, t)}
          </h1>
        </div>
        <CalendarFeatureCard
          eyebrow={t('todayFeast')}
          title={heroToday?.label || t('quietDays')}
          date={heroTodayDate}
          oldDate={heroTodayOldDate}
          note={heroToday?.note}
          link={{ href: heroToday?.label ? heroTodayHref : '#calendar-grid', label: heroToday?.label ? t('more') : t('calendar') }}
        />
        <CalendarImageCard
          imageUrl={iconOfDay?.imageUrl}
          imageAlt={iconOfDay?.title || t('iconOfDay')}
          eyebrow={t('todayIcon')}
          title={heroToday?.label || localizedHeroText(hero?.iconDayTitle || iconOfDay?.title, 'iconOfDay', t)}
          dateText={`${heroTodayDate}${heroTodayOldDate ? ` / ${heroTodayOldDate}` : ''}`}
          link={{ href: prayerOfDay ? `/prayers/${prayerOfDay.slug}` : '/prayers', label: t('openPrayer') }}
        />
        <CalendarInfoCard eyebrow={t('information')} title={t('catalog')} links={navigationTips} />
      </section>

      <div className="relative z-40 grid grid-cols-[minmax(360px,1fr)_auto_auto_auto] items-center gap-3 border-t border-gold/28 mt-[clamp(24px,3vw,44px)] py-3.5 text-foreground max-[900px]:grid-cols-1 max-[900px]:items-start max-[520px]:relative max-[520px]:z-[60] max-[520px]:border-b max-[520px]:bg-[rgba(11,11,10,.94)] max-[520px]:backdrop-blur-[14px]">
        <div className="min-w-0 flex items-center gap-2.5 text-foreground max-[900px]:w-full max-[900px]:justify-between max-[900px]:overflow-visible max-[900px]:pb-0 max-[430px]:grid max-[430px]:grid-cols-[42px_minmax(0,1fr)_42px]">
          <button
            className="inline-flex min-h-[38px] min-w-[116px] items-center justify-center gap-2 rounded-md border border-gold/28 bg-[linear-gradient(135deg,rgba(127,141,101,.08),transparent_60%),#141511] px-3 font-black text-gold-light whitespace-nowrap cursor-pointer max-[900px]:min-w-0 max-[900px]:flex-1 max-[430px]:min-w-0 max-[430px]:w-[42px] max-[430px]:px-0"
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label={`${t(prevMonth.key)}`}
          >
            <span className="inline-grid place-items-center text-[18px] leading-none"><SvgIcon name="arrow-left" size={18} /></span>
            <small className="min-w-0 overflow-hidden text-ellipsis text-[14px] font-black leading-none text-foreground max-[900px]:hidden">{t(prevMonth.key)}</small>
          </button>
          <strong className="min-w-[136px] text-center text-foreground text-[clamp(16px,1vw,19px)] whitespace-nowrap max-[900px]:min-w-[128px] max-[430px]:min-w-0 max-[430px]:text-[16px]">
            {monthTitle}{calendarLoading ? ` - ${t('calendarLoading')}` : ''}
          </strong>
          <button
            className="inline-flex min-h-[38px] min-w-[116px] items-center justify-center gap-2 rounded-md border border-gold/28 bg-[linear-gradient(135deg,rgba(127,141,101,.08),transparent_60%),#141511] px-3 font-black text-gold-light whitespace-nowrap cursor-pointer max-[900px]:min-w-0 max-[900px]:flex-1 max-[430px]:min-w-0 max-[430px]:w-[42px] max-[430px]:px-0"
            type="button"
            onClick={() => moveMonth(1)}
            aria-label={`${t(nextMonth.key)}`}
          >
            <small className="min-w-0 overflow-hidden text-ellipsis text-[14px] font-black leading-none text-foreground max-[900px]:hidden">{t(nextMonth.key)}</small>
            <span className="inline-grid place-items-center text-[18px] leading-none"><SvgIcon name="arrow-right" size={18} /></span>
          </button>
        </div>
        <div className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground max-[900px]:w-full max-[900px]:justify-stretch" aria-label="Вибір року">
          <button
            className="h-[38px] w-[34px] rounded-md border border-gold/28 bg-[#141511] text-[18px] font-black text-gold-light cursor-pointer"
            type="button"
            onClick={() => moveYear(-1)}
            aria-label={t('prevYear')}
          >
            <SvgIcon name="minus" size={18} />
          </button>
          <label className="h-[38px] inline-flex items-center gap-2 rounded-md border border-gold/28 bg-[#141511] px-3 max-[900px]:flex-1 max-[900px]:justify-center">
            <span className="text-muted-foreground text-[12px] font-black tracking-[.08em] uppercase">{t('yearLabel')}</span>
            <input
              className="w-[92px] min-w-[92px] border-0 bg-transparent text-foreground [color-scheme:dark] text-[16px] font-black outline-none text-center [font-variant-numeric:tabular-nums] max-[900px]:w-[110px] max-[900px]:min-w-[110px] max-[430px]:w-[86px] max-[430px]:min-w-[86px]"
              type="number"
              min="1900"
              max="2100"
              value={year}
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                if (Number.isFinite(nextYear)) setCalendarYear(nextYear);
              }}
            />
          </label>
          <button
            className="h-[38px] w-[34px] rounded-md border border-gold/28 bg-[#141511] text-[18px] font-black text-gold-light cursor-pointer"
            type="button"
            onClick={() => moveYear(1)}
            aria-label={t('nextYear')}
          >
            <SvgIcon name="plus" size={18} />
          </button>
        </div>
        <div className="relative z-[70] max-[900px]:w-full">
          <button
            className="inline-flex min-h-[38px] items-center justify-between gap-2 rounded-md border border-gold/28 bg-[#141511] pr-3 pl-3.5 text-[14px] leading-none whitespace-nowrap text-gold-light font-black cursor-pointer outline-none focus-visible:border-gold max-[900px]:w-full max-[430px]:min-h-[42px]"
            type="button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <span>{t('filter')}</span>
            <strong className="text-foreground text-[14px]">{t(filterLabelKeys[filter])}</strong>
            <i className={`inline-grid size-4 place-items-center not-italic transition-transform duration-[180ms] ease-brand ${filterOpen ? 'rotate-180' : ''}`} aria-hidden="true">
              <SvgIcon name="chevron-down" size={16} />
            </i>
          </button>
          {filterOpen ? (
            <div className="absolute top-[calc(100%+10px)] right-0 z-[90] w-[250px] rounded-md border border-gold p-1.5 bg-[#141511] shadow-[0_14px_34px_rgba(0,0,0,.24)] max-[900px]:right-auto max-[900px]:left-0 max-[900px]:w-[min(290px,calc(100vw-28px))]">
              {(Object.keys(filterLabelKeys) as FilterKind[]).map((kind) => (
                <button
                  key={kind}
                  className={`w-full min-h-[38px] rounded-xs border-0 px-2.5 bg-transparent text-left text-foreground font-black cursor-pointer [&+&]:border-t [&+&]:border-t-[rgba(232,211,169,.13)] hover:bg-gold hover:text-canvas ${filter === kind ? 'bg-gold text-canvas' : ''}`}
                  type="button"
                  onClick={() => {
                    setFilter(kind);
                    setFilterOpen(false);
                  }}
                >
                  {t(filterLabelKeys[kind])}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-2 text-muted-foreground font-black whitespace-nowrap max-[900px]:w-full max-[900px]:justify-start max-[430px]:min-h-[40px]" role="group" aria-label={t('calendarViewLabel')}>
          <button
            className={`border-0 bg-transparent font-black cursor-pointer ${view === 'calendar' ? 'text-foreground underline underline-offset-4' : 'text-gold-light'}`}
            type="button"
            onClick={() => setView('calendar')}
          >
            {t('calendar')}
          </button>
          <span>|</span>
          <button
            className={`border-0 bg-transparent font-black cursor-pointer ${view === 'list' ? 'text-foreground underline underline-offset-4' : 'text-gold-light'}`}
            type="button"
            onClick={() => setView('list')}
          >
            {t('list')}
          </button>
        </div>
      </div>

      <div className="block w-full max-w-none">
        <section id="calendar-grid" className="w-full overflow-x-auto pb-2 max-[1280px]:overflow-visible">
          <div
            className={`min-w-0 [transform:translate3d(0,0,0)] [will-change:opacity,transform] motion-reduce:animate-none ${monthSwapClass}`}
            data-direction={monthDirection}
          >
            <h2 className="w-full max-w-full mt-[clamp(28px,5vw,64px)] mx-0 mb-[clamp(20px,3vw,38px)] pt-[.12em] px-[.04em] pb-[.18em] font-serif font-bold text-foreground text-[clamp(48px,6.4vw,108px)] leading-[1.12] [overflow-wrap:anywhere] max-[520px]:text-[clamp(52px,22vw,84px)] max-[520px]:mt-[30px] max-[520px]:px-[.03em] max-[520px]:pb-[.2em] max-[520px]:leading-[1.14] max-[430px]:text-[clamp(40px,17vw,58px)] max-[430px]:mt-[22px] max-[430px]:mb-[18px] max-[430px]:leading-[1.16]">
              {t(months[monthIndex].key)}
            </h2>
            {visibleDays.length ? (
              <>
                {view === 'calendar' ? (
                  <div className="grid grid-cols-7 gap-3.5 mb-3.5 max-[520px]:gap-1.5 max-[430px]:gap-1 max-[430px]:mb-1.5" aria-label={t('weekdaysLabel')}>
                    {weekdayKeys.map((key) => (
                      <span key={key} className="min-w-0 border-b border-gold/28 pb-2.5 text-muted-foreground font-serif text-[14px] font-extrabold tracking-[.08em] uppercase max-[520px]:text-[10px] max-[520px]:tracking-[.02em] max-[430px]:border-b-0 max-[430px]:pb-1 max-[430px]:text-center max-[430px]:text-[9px]">
                        {t(key)}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div
                  className={
                    view === 'list'
                      ? 'grid gap-0 border-t border-gold/28'
                      : 'w-full min-w-0 grid grid-cols-7 gap-3.5 items-stretch bg-[linear-gradient(180deg,rgba(205,164,90,.045),rgba(11,12,10,.16)),#0b0c0a] max-[520px]:gap-1.5 max-[520px]:bg-transparent'
                  }
                >
                  {view === 'list' ? visibleDays.map((item) => {
                    const imageUrl = item.imageUrl || item.icon?.imageUrl || '';
                    const detailHref = pageHrefForDay(item, pages);
                    const itemKey = calendarCellKey(item, year, monthIndex);
                    const isExpanded = expandedDay === itemKey;

                    return (
                      <CalendarListDay
                        key={itemKey}
                        item={item}
                        itemKey={itemKey}
                        imageUrl={imageUrl}
                        detailHref={detailHref}
                        isToday={isCurrentVisibleMonth && item.day === realTodayDay}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedDay((current) => current === itemKey ? '' : itemKey)}
                        dateLabel={dayDateLabel(item)}
                        quietLabel={t('quietDays')}
                        iconFallbackAlt={t('iconOfDay')}
                        openDayLabel={t('openDay')}
                        dayLinksLabel={t('dayLinks')}
                        monthGenitiveLabel={t('januaryGenitive')}
                        monthLabel={monthTitle}
                        actionLabels={dayActionLabels}
                      />
                    );
                  }) : visibleDays.map((item) => {
                    const imageUrl = item.imageUrl || item.icon?.imageUrl || '';
                    const detailHref = pageHrefForDay(item, pages);
                    const itemKey = calendarCellKey(item, year, monthIndex);

                    return (
                      <CalendarGridDay
                        key={itemKey}
                        item={item}
                        imageUrl={imageUrl}
                        detailHref={detailHref}
                        isToday={!item.outOfMonth && isCurrentVisibleMonth && item.day === realTodayDay}
                        dateLabel={dayDateLabel(item)}
                        todayLabel={t('today')}
                        iconFallbackAlt={t('iconOfDay')}
                        openDayLabel={t('openDay')}
                        dayLinksLabel={t('dayLinks')}
                        monthGenitiveLabel={t('januaryGenitive')}
                        actionLabels={dayActionLabels}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="m-0 border-t border-gold/28 py-6 text-muted-foreground text-[18px]">{t('noDays')}</p>
            )}
          </div>
        </section>

      </div>

      <section className="grid grid-cols-4 gap-[clamp(18px,2.7vw,50px)] mt-[clamp(38px,5vw,78px)] border-t border-gold/28 pt-[22px] max-[900px]:grid-cols-1">
        {services.map((service) => (
          <CalendarServiceCard key={service.id} href={service.href} index={service.index} title={service.title} description={service.description} />
        ))}
      </section>
    </section>
  );
}
