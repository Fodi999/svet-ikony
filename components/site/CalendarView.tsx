'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CalendarContent, CalendarServiceCard as CalendarService, GospelReading, Icon, Prayer, SeoPage } from '@/lib/types';
import { LanguageSwitch, useI18n } from './LanguageProvider';
import { withLocale, type TranslationKey } from '@/lib/i18n';
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
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const publicPrefix = apiUrl.endsWith('/public') ? '' : '/public';

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

function queryForMonth(pathname: string, searchParams: URLSearchParams, year: number, monthIndex: number) {
  const params = new URLSearchParams(searchParams.toString());
  params.set('year', String(year));
  params.set('month', String(monthIndex + 1));
  return `${pathname}?${params.toString()}`;
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

function createMonthDays(icons: Icon[], prayers: Prayer[], gospel: GospelReading, calendar: CalendarContent | undefined, totalDays: number): CalendarDay[] {
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

  return fillMonthDays([
    { day: '01', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '02', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '03', label: 'Икона Божией Матери «Казанская»', note: 'Праздничная икона', kind: 'feast', icon: icons[0], feast: true, description: 'Молитва о семье, мире и укреплении в вере.' },
    { day: '04', label: 'Святитель Николай Чудотворец', note: 'Память святого', kind: 'feast', icon: icons[1], description: 'Почитание святого, помощника в пути и нужде.' },
    { day: '05', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '06', label: 'Крещение Господне', note: 'Праздник', kind: 'feast', icon: icons[0], current: true, description: 'Воспоминание Богоявления и освящения вод.' },
    { day: '07', label: 'Рождество Христово', note: 'Празднество', kind: 'fast', icon: icons[1], feast: true, description: 'Праздничное чтение и домашняя молитва.' },
    { day: '08', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '09', label: 'Блаженная Матрона Московская', note: 'Память святой', kind: 'prayer', icon: icons[2], description: 'Молитва о помощи в житейских обстоятельствах.' },
    { day: '10', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '11', label: 'Великомученик Пантелеимон', note: 'Память святого', kind: 'prayer', icon: icons[2], description: 'Молитвенное обращение о болящих.' },
    { day: '12', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '13', label: 'Собор Предтечи и Крестителя Господня Иоанна', note: 'Память святого', kind: 'feast', icon: icons[1], description: 'День молитвенного почитания Предтечи.' },
    { day: '14', label: 'Обрезание Господне', note: 'Господский праздник', kind: 'feast', icon: icons.find((icon) => icon.slug === 'obrezanie-gospodne') ?? icons[0], current: true, feast: true, description: 'Праздник Обрезания Господня: 1 января по церковному юлианскому календарю, 14 января по гражданскому календарю.' },
    { day: '15', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '16', label: 'Икона Божией Матери «Умиление»', note: 'Праздничная икона', kind: 'feast', icon: icons[0], description: 'Молитва о мире сердца и покаянии.' },
    { day: '17', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '18', label: gospel.reference ? 'Неделя 32-я по Пятидесятнице' : 'Евангельское чтение', note: 'Евангельское чтение', kind: 'gospel', icon: icons[0], description: gospel.text }
  ], totalDays);
}

function createQuietMonth(totalDays: number): CalendarDay[] {
  return fillMonthDays([], totalDays);
}

function collectCalendarImageUrls(calendar: CalendarContent | undefined, icons: Icon[], prayers: Prayer[], gospel: GospelReading) {
  if (!calendar) return [];
  const monthIndex = monthIndexFromTitle(calendar.hero?.monthTitle);
  const year = Number(calendar.hero?.year) || new Date().getFullYear();
  const days = createMonthDays(icons, prayers, gospel, calendar, getDaysInMonth(year, monthIndex));
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

function dayDateLabel(item: CalendarDay) {
  if (item.gregorianDate && item.julianDate) return `${item.gregorianDate} / ${item.julianDate} ст. ст.`;
  if (item.julianDate) return `${item.julianDate} ст. ст.`;
  return '';
}

function formatCalendarDate(date: Date, locale: string) {
  const localeCode = locale === 'en' ? 'en-US' : locale === 'uk' ? 'uk-UA' : 'ru-RU';
  return new Intl.DateTimeFormat(localeCode, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

async function fetchCalendarContent(year: number, monthIndex: number, locale: string, signal: AbortSignal) {
  if (!apiUrl) throw new Error('Calendar API URL is not configured');
  const query = new URLSearchParams({
    year: String(year),
    month: String(monthIndex + 1),
    locale
  });
  const response = await fetch(`${apiUrl}${publicPrefix}/api/content?${query.toString()}`, {
    cache: 'no-store',
    signal
  });
  if (!response.ok) throw new Error('Calendar content is not available');
  const content = await response.json() as { calendar?: CalendarContent };
  return content.calendar;
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

export function CalendarView({ icons, prayers, gospel, pages = [], calendar }: { icons: Icon[]; prayers: Prayer[]; gospel: GospelReading; pages?: SeoPage[]; calendar?: CalendarContent }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [view, setView] = useState<ViewMode>('calendar');
  const [expandedDay, setExpandedDay] = useState('monthJanuary-14');
  const [activeCalendar, setActiveCalendar] = useState(calendar);
  const initialYear = Number(calendar?.hero?.year) || new Date().getFullYear();
  const [year, setYear] = useState(initialYear);
  const [monthIndex, setMonthIndex] = useState(() => monthIndexFromTitle(calendar?.hero?.monthTitle));
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
    () => showMonthPlaceholder ? createQuietMonth(monthDaysTotal) : createMonthDays(icons, prayers, gospel, selectedCalendar, monthDaysTotal),
    [icons, prayers, gospel, selectedCalendar, monthDaysTotal, showMonthPlaceholder]
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
  const iconOfDay = showMonthPlaceholder ? undefined : heroToday?.icon ?? icons.find((icon) => icon.slug === hero?.iconDayIconSlug) ?? icons[1] ?? icons[0];
  const prayerOfDay = prayers.find((prayer) => prayer.slug === heroToday?.prayerSlug)
    ?? prayers.find((prayer) => prayer.slug === hero?.iconDayPrayerSlug)
    ?? prayers[0];
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
    { id: 'service-feasts', index: '03', title: t('calendarServiceFeastsTitle'), description: t('calendarServiceFeastsText'), href: '/p/pravoslavnaya-ikona-s-qr-kodom' },
    { id: 'service-icons', index: '04', title: t('calendarServiceIconsTitle'), description: t('calendarServiceIconsText'), href: '/icons' }
  ]).map((service) => localizeService(service, t));

  useEffect(() => {
    if (!calendar) return;
    const calendarYear = Number(calendar.hero?.year) || initialYear;
    const calendarMonthIndex = monthIndexFromTitle(calendar.hero?.monthTitle);
    const key = calendarCacheKey(calendarYear, calendarMonthIndex, locale);
    calendarCache.current.set(key, calendar);
    if (calendarYear === year && calendarMonthIndex === monthIndex) {
      setActiveCalendar((current) => current === calendar ? current : calendar);
    }
  }, [calendar, initialYear, locale, monthIndex, year]);

  useEffect(() => {
    const queryYear = Number(searchParams.get('year'));
    const queryMonth = Number(searchParams.get('month'));
    if (!Number.isFinite(queryYear) || !Number.isFinite(queryMonth) || queryMonth < 1 || queryMonth > 12) return;

    const nextMonthIndex = queryMonth - 1;
    const queryKey = calendarCacheKey(queryYear, nextMonthIndex, locale);
    const stateKey = calendarCacheKey(year, monthIndex, locale);
    if (queryKey === stateKey) {
      pendingLocalMonth.current = null;
      return;
    }
    if (pendingLocalMonth.current === stateKey) return;

    const currentAbsolute = year * 12 + monthIndex;
    const nextAbsolute = queryYear * 12 + nextMonthIndex;
    setMonthDirection(nextAbsolute >= currentAbsolute ? 'next' : 'prev');
    pendingLocalMonth.current = null;
    setYear(queryYear);
    setMonthIndex(nextMonthIndex);
  }, [locale, monthIndex, searchParams, year]);

  useEffect(() => {
    const key = calendarCacheKey(year, monthIndex, locale);
    const cachedCalendar = calendarCache.current.get(key);
    if (cachedCalendar) {
      setActiveCalendar(cachedCalendar);
      setCalendarLoading(false);
      preloadImages(collectCalendarImageUrls(cachedCalendar, icons, prayers, gospel), preloadedImages.current);
      return;
    }

    const controller = new AbortController();
    setCalendarLoading(true);
    fetchCalendarContent(year, monthIndex, locale, controller.signal)
      .then((nextCalendar) => {
        if (!nextCalendar) return;
        calendarCache.current.set(key, nextCalendar);
        setActiveCalendar(nextCalendar);
        preloadImages(collectCalendarImageUrls(nextCalendar, icons, prayers, gospel), preloadedImages.current);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false);
      });
    return () => controller.abort();
  }, [gospel, icons, locale, monthIndex, prayers, year]);

  useEffect(() => {
    const controllers: AbortController[] = [];

    [-1, 1].forEach((delta) => {
      const adjacent = monthFromAbsolute(year * 12 + monthIndex + delta);
      const key = calendarCacheKey(adjacent.year, adjacent.monthIndex, locale);
      const cachedCalendar = calendarCache.current.get(key);
      const href = queryForMonth(pathname, new URLSearchParams(searchParams.toString()), adjacent.year, adjacent.monthIndex);

      router.prefetch(href);

      if (cachedCalendar) {
        preloadImages(collectCalendarImageUrls(cachedCalendar, icons, prayers, gospel), preloadedImages.current);
        return;
      }

      const controller = new AbortController();
      controllers.push(controller);
      fetchCalendarContent(adjacent.year, adjacent.monthIndex, locale, controller.signal)
        .then((nextCalendar) => {
          if (!nextCalendar) return;
          calendarCache.current.set(key, nextCalendar);
          preloadImages(collectCalendarImageUrls(nextCalendar, icons, prayers, gospel), preloadedImages.current);
        })
        .catch(() => undefined);
    });

    return () => controllers.forEach((controller) => controller.abort());
  }, [gospel, icons, locale, monthIndex, pathname, prayers, router, searchParams, year]);

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
    const params = new URLSearchParams(searchParams.toString());
    const nextYear = String(year);
    const nextMonth = String(monthIndex + 1);
    if (params.get('year') === nextYear && params.get('month') === nextMonth) {
      pendingLocalMonth.current = null;
      return;
    }
    params.set('year', String(year));
    params.set('month', String(monthIndex + 1));
    pendingLocalMonth.current = calendarCacheKey(year, monthIndex, locale);
    const nextUrl = `${pathname}?${params.toString()}`;
    router.replace(nextUrl, { scroll: false });
  }, [locale, monthIndex, pathname, router, searchParams, year]);

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

  return (
    <section className="calendar-page">
      <div className="calendar-topline">
        <Link className="calendar-logo" href={withLocale('/', locale)}>
          <span className="orthodox-cross"><SvgIcon name="orthodox-cross" size={25} /></span>
          <span><strong>{t('brand')}</strong><small>{t('portal')}</small></span>
        </Link>
        <div className="calendar-top-actions">
          <LanguageSwitch />
          <nav className="calendar-breadcrumbs" aria-label={`${t('home')} / ${t('calendar')}`}>
            <Link href={withLocale('/', locale)}>{t('home')}</Link>
            <b>/</b>
            <a href="#calendar-grid">{t('calendar')}</a>
          </nav>
        </div>
      </div>

      <section className="calendar-hero">
        <div>
          <span className="calendar-year">{hero?.year ?? '2026'}</span>
          <h1>{localizedHeroTitle(hero?.title, t)}</h1>
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

      <div className="calendar-toolbar">
        <div className="month-switch">
          <button className="month-step" type="button" onClick={() => moveMonth(-1)} aria-label={`${t(prevMonth.key)}`}>
            <span><SvgIcon name="arrow-left" size={18} /></span>
            <small>{t(prevMonth.key)}</small>
          </button>
          <strong>{monthTitle}{calendarLoading ? ` - ${t('calendarLoading')}` : ''}</strong>
          <button className="month-step" type="button" onClick={() => moveMonth(1)} aria-label={`${t(nextMonth.key)}`}>
            <small>{t(nextMonth.key)}</small>
            <span><SvgIcon name="arrow-right" size={18} /></span>
          </button>
        </div>
        <div className="year-switch" aria-label="Вибір року">
          <button type="button" onClick={() => moveYear(-1)} aria-label={t('prevYear')}><SvgIcon name="minus" size={18} /></button>
          <label>
            <span>{t('yearLabel')}</span>
            <input
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
          <button type="button" onClick={() => moveYear(1)} aria-label={t('nextYear')}><SvgIcon name="plus" size={18} /></button>
        </div>
        <div className="calendar-filter">
          <button className="filter-toggle" type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
            <span>{t('filter')}</span>
            <strong>{t(filterLabelKeys[filter])}</strong>
            <i aria-hidden="true"><SvgIcon name="chevron-down" size={16} /></i>
          </button>
          {filterOpen ? (
            <div className="filter-menu">
              {(Object.keys(filterLabelKeys) as FilterKind[]).map((kind) => (
                <button
                  key={kind}
                  className={filter === kind ? 'active' : ''}
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
        <div className="view-switch" role="group" aria-label={t('calendarViewLabel')}>
          <button className={view === 'calendar' ? 'active' : ''} type="button" onClick={() => setView('calendar')}>{t('calendar')}</button>
          <span>|</span>
          <button className={view === 'list' ? 'active' : ''} type="button" onClick={() => setView('list')}>{t('list')}</button>
        </div>
      </div>

      <div className="calendar-main">
        <section id="calendar-grid" className="month-block">
          <div className={'calendar-month-surface' + (monthTransition ? ' is-changing' : '')} data-direction={monthDirection}>
            <h2>{t(months[monthIndex].key)}</h2>
            {visibleDays.length ? (
              <>
                {view === 'calendar' ? (
                  <div className="weekday-strip" aria-label={t('weekdaysLabel')}>
                    {weekdayKeys.map((key) => <span key={key}>{t(key)}</span>)}
                  </div>
                ) : null}
                <div className={view === 'list' ? 'calendar-list' : 'calendar-grid'}>
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
                        isToday={item.day === today.day}
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
                        isToday={!item.outOfMonth && item.day === today.day}
                        dateLabel={dayDateLabel(item)}
                        todayLabel={t('today')}
                        iconFallbackAlt={t('iconOfDay')}
                        openDayLabel={t('openDay')}
                        dayLinksLabel={t('dayLinks')}
                        monthGenitiveLabel={t('januaryGenitive')}
                        outOfMonthLabel={item.monthKey ? t(item.monthKey) : undefined}
                        actionLabels={dayActionLabels}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="calendar-empty">{t('noDays')}</p>
            )}
          </div>
        </section>

        <aside className="today-card">
          <p>{t('today')}</p>
          <strong>{hero?.todayDate ?? t('jan14')}</strong>
          <dl>
            <dt>{t('todayFeast')}</dt>
            <dd>{today?.label}</dd>
            <dt>{t('gospelDay')}</dt>
            <dd>{hero?.todayGospel || gospel.reference}</dd>
            <dt>{t('prayerDay')}</dt>
            <dd>{hero?.todayPrayerTitle || prayerOfDay?.title}</dd>
          </dl>
          <Link href={withLocale(hero?.todayHref || '/gospel', locale)}>{t('read')}</Link>
        </aside>
      </div>

      <section className="calendar-service-grid">
        {services.map((service) => (
          <CalendarServiceCard key={service.id} href={service.href} index={service.index} title={service.title} description={service.description} />
        ))}
      </section>
    </section>
  );
}
