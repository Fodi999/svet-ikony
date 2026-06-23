'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CalendarContent, GospelReading, Icon, Prayer, SeoPage } from '@/lib/types';
import { LanguageSwitch, useI18n } from './LanguageProvider';
import type { TranslationKey } from '@/lib/i18n';

type DayKind = 'feast' | 'fast' | 'gospel' | 'prayer' | 'quiet';
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
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://ministerial-yetta-fodi999-c58d8823.koyeb.app').replace(/\/+$/, '');
const publicPrefix = apiUrl.endsWith('/public') ? '' : '/public';

type CalendarDay = {
  day: string;
  gregorianDate?: string;
  julianDay?: string;
  julianDate?: string;
  label: string;
  note: string;
  kind: DayKind;
  imageUrl?: string;
  icon?: Icon;
  prayerSlug?: string;
  gospelSlug?: string;
  detailHref?: string;
  current?: boolean;
  feast?: boolean;
  textOnly?: boolean;
  description?: string;
  outOfMonth?: boolean;
  monthKey?: TranslationKey;
};

const filterLabelKeys: Record<FilterKind, TranslationKey> = {
  all: 'allDays',
  feast: 'feastIcons',
  fast: 'fastSpecial',
  gospel: 'gospel',
  prayer: 'prayers',
  quiet: 'quietDays'
};

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
        imageUrl: day.imageUrl || icon?.imageUrl,
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

function getMondayStartOffset(year: number, monthIndex: number) {
  return (new Date(year, monthIndex, 1).getDay() + 6) % 7;
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

async function fetchCalendarContent(year: number, monthIndex: number, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}${publicPrefix}/api/content?year=${year}&month=${monthIndex + 1}`, {
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

export function CalendarView({ icons, prayers, gospel, pages = [], calendar }: { icons: Icon[]; prayers: Prayer[]; gospel: GospelReading; pages?: SeoPage[]; calendar?: CalendarContent }) {
  const { t } = useI18n();
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [view, setView] = useState<ViewMode>('calendar');
  const [expandedDay, setExpandedDay] = useState('monthJanuary-14');
  const [activeCalendar, setActiveCalendar] = useState(calendar);
  const initialYear = Number(calendar?.hero?.year) || new Date().getFullYear();
  const [year, setYear] = useState(initialYear);
  const [monthIndex, setMonthIndex] = useState(() => monthIndexFromTitle(calendar?.hero?.monthTitle));
  const [calendarLoading, setCalendarLoading] = useState(false);
  const activeCalendarYear = Number(activeCalendar?.hero?.year) || 0;
  const activeCalendarMonth = monthIndexFromTitle(activeCalendar?.hero?.monthTitle);
  const selectedCalendar = activeCalendarYear === year && activeCalendarMonth === monthIndex ? activeCalendar : undefined;
  const hero = selectedCalendar?.hero;
  const monthDaysTotal = getDaysInMonth(year, monthIndex);
  const days = useMemo(() => createMonthDays(icons, prayers, gospel, selectedCalendar, monthDaysTotal), [icons, prayers, gospel, selectedCalendar, monthDaysTotal]);
  const calendarGridDays = useMemo(() => createCalendarGridDays(days, monthIndex, year), [days, monthIndex, year]);
  const visibleDays = filter === 'all' ? (view === 'calendar' ? calendarGridDays : days) : days.filter((day) => day.kind === filter);
  const now = new Date();
  const today = days.find((day) => day.current)
    ?? (now.getFullYear() === year && now.getMonth() === monthIndex ? days.find((day) => day.day === String(now.getDate()).padStart(2, '0')) : undefined)
    ?? days.find((day) => day.label)
    ?? days[0];
  const prevMonth = months[(monthIndex + 11) % 12];
  const nextMonth = months[(monthIndex + 1) % 12];
  const monthTitle = `${t(months[monthIndex].key)} ${year}`;
  const iconOfDay = icons.find((icon) => icon.slug === hero?.iconDayIconSlug) ?? icons[1] ?? icons[0];
  const prayerOfDay = prayers.find((prayer) => prayer.slug === hero?.iconDayPrayerSlug) ?? prayers[0];
  const services = selectedCalendar?.services?.length ? selectedCalendar.services : [
    { id: 'service-prayers', index: '01', title: 'Молитвы на каждый день', description: 'Краткое правило и молитвы перед иконой.', href: '/prayers' },
    { id: 'service-gospel', index: '02', title: 'Евангелие дня', description: 'Чтение, ссылка и спокойное объяснение.', href: '/gospel' },
    { id: 'service-feasts', index: '03', title: 'Праздники и посты', description: 'Церковные даты, важные дни и отметки.', href: '/p/pravoslavnaya-ikona-s-qr-kodom' },
    { id: 'service-icons', index: '04', title: 'Иконы святых', description: 'История образов, жития и QR-страницы.', href: '/icons' }
  ];

  useEffect(() => {
    const controller = new AbortController();
    setCalendarLoading(true);
    fetchCalendarContent(year, monthIndex, controller.signal)
      .then((nextCalendar) => {
        if (nextCalendar) setActiveCalendar(nextCalendar);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false);
      });
    return () => controller.abort();
  }, [year, monthIndex]);

  function moveMonth(delta: number) {
    const absoluteMonth = year * 12 + monthIndex + delta;
    setYear(Math.floor(absoluteMonth / 12));
    setMonthIndex(((absoluteMonth % 12) + 12) % 12);
  }

  return (
    <section className="calendar-page">
      <div className="calendar-topline">
        <Link className="calendar-logo" href="/">
          <span className="orthodox-cross">☦</span>
          <span><strong>{t('brand')}</strong><small>{t('portal')}</small></span>
        </Link>
        <div className="calendar-top-actions">
          <LanguageSwitch />
          <nav className="calendar-breadcrumbs" aria-label={`${t('home')} / ${t('calendar')}`}>
            <Link href="/">{t('home')}</Link>
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
        <aside className="calendar-feature">
          <p>{t('todayFeast')}</p>
          <strong><span className="gold-cross">☦</span> {localizedHeroText(hero?.featureTitle, 'saintVasily', t)}</strong>
          <span>{localizedHeroText(hero?.featureNote, 'saintMemory', t)}<br />{localizedHeroText(hero?.featureDate, 'jan14Old', t)}</span>
          <Link href={hero?.featureHref || '/saints/nikolay-chudotvorets'}>{t('aboutFeast')} →</Link>
        </aside>
        <aside className="calendar-icon-day">
          {iconOfDay ? <img src={iconOfDay.imageUrl} alt={iconOfDay.title} /> : null}
          <div>
            <p>{t('todayIcon')}</p>
            <strong>{localizedHeroText(hero?.iconDayTitle || iconOfDay?.title, 'iconOfDay', t)}</strong>
            <span>{localizedHeroText(hero?.iconDayDate, 'jan14', t)}</span>
            <Link href={prayerOfDay ? `/prayers/${prayerOfDay.slug}` : '/prayers'}>{t('openPrayer')} →</Link>
          </div>
        </aside>
        <aside className="calendar-info">
          <p>{t('information')}</p>
          <span><i /> {localizedHeroText(hero?.infoPrimary, 'currentFeast', t)}</span>
          <span><i className="red" /> {localizedHeroText(hero?.infoSecondary, 'importantDay', t)}</span>
        </aside>
      </section>

      <div className="calendar-toolbar">
        <div className="month-switch">
          <button type="button" onClick={() => moveMonth(-1)}>← {t(prevMonth.key)}</button>
          <strong>{monthTitle}{calendarLoading ? ' · загрузка' : ''}</strong>
          <button type="button" onClick={() => moveMonth(1)}>{t(nextMonth.key)} →</button>
        </div>
        <div className="calendar-filter">
          <button className="filter-toggle" type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
            <span>{t('filter')}: {t(filterLabelKeys[filter])}</span><i aria-hidden="true">⌄</i>
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
          <h2>{t(months[monthIndex].key)}</h2>
          {visibleDays.length ? (
            <div className={view === 'list' ? 'calendar-list' : 'calendar-grid'}>
              {view === 'list' ? visibleDays.map((item) => {
                const imageUrl = item.imageUrl || item.icon?.imageUrl || '';
                const detailHref = pageHrefForDay(item, pages);
                const itemKey = `${months[monthIndex].key}-${item.day}`;
                const isExpanded = expandedDay === itemKey;
                const hasContent = Boolean(item.label);

                return (
                  <article key={itemKey} className={'list-accordion-item' + (isExpanded ? ' open' : '') + (item.day === today.day ? ' today' : '')}>
                    <button
                      className="list-accordion-trigger"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedDay((current) => current === itemKey ? '' : itemKey)}
                    >
                      <span className="list-day-number">{item.day}{item.current ? <i /> : null}{item.feast || item.kind === 'fast' ? <i className="red" /> : null}</span>
                      <span className="list-day-heading">
                        <strong>{hasContent ? item.label : t('quietDays')}</strong>
                        <small>{hasContent ? item.note : monthTitle}</small>
                      </span>
                      <span className="list-accordion-mark" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </button>
                    {isExpanded ? (
                      <div className="list-accordion-panel">
                        {imageUrl ? (
                          <Link className="list-image-link" href={detailHref} aria-label={`${t('openDay')} ${item.label || t('iconOfDay')}`}>
                            <img src={imageUrl} alt={item.icon?.title || item.label || t('iconOfDay')} />
                          </Link>
                        ) : null}
                        <div className="list-panel-copy">
                          <p>{hasContent ? item.note : t('quietDays')}</p>
                          <h3>{hasContent ? item.label : `${item.day} ${t(months[monthIndex].key)}`}</h3>
                          {dayDateLabel(item) ? <small>{dayDateLabel(item)}</small> : null}
                          {item.description ? <span>{item.description}</span> : <span>{monthTitle}</span>}
                          {hasContent ? (
                            <nav className="list-panel-links" aria-label={`${t('dayLinks')} ${item.day} ${t('januaryGenitive')}`}>
                              <Link href={item.prayerSlug ? `/prayers/${item.prayerSlug}` : '/prayers'}>{t('prayers')}</Link>
                              <Link href={item.gospelSlug && item.gospelSlug !== 'today' ? `/gospel/${item.gospelSlug}` : '/gospel'}>{t('gospel')}</Link>
                              <Link href={detailHref}>{t('more')}</Link>
                            </nav>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              }) : (
                <>
                  {weekdayKeys.map((key) => <div className="weekday-cell" key={key}>{t(key)}</div>)}
                  {visibleDays.map((item) => {
                const imageUrl = item.imageUrl || item.icon?.imageUrl || '';
                const detailHref = pageHrefForDay(item, pages);

                return (
                  <article key={`${item.monthKey || months[monthIndex].key}-${item.day}`} className={'calendar-day' + (item.textOnly ? ' text-only' : '') + (!item.outOfMonth && item.day === today.day ? ' today' : '') + (item.outOfMonth ? ' out-of-month' : '')}>
                    <div className="day-number">{item.day}{item.outOfMonth && item.monthKey ? <small>{t(item.monthKey)}</small> : null}{item.current ? <i /> : null}{item.feast || item.kind === 'fast' ? <i className="red" /> : null}</div>
                    {!item.outOfMonth && item.day === today.day ? <span className="today-badge">{t('today')}</span> : null}
                    {item.label ? (
                      <div className="day-event">
                        {!item.outOfMonth && imageUrl && view === 'calendar' ? (
                          <Link className="day-image-link" href={detailHref} aria-label={`${t('openDay')} ${item.label || t('iconOfDay')}`}>
                            <img src={imageUrl} alt={item.icon?.title || item.label || t('iconOfDay')} />
                          </Link>
                        ) : null}
                        <div className="day-copy">
                          <Link className="day-title-link" href={detailHref}>{item.label}</Link>
                          <span>{item.note}</span>
                          {dayDateLabel(item) ? <span className="day-date-note">{dayDateLabel(item)}</span> : null}
                          {item.description ? <em>{item.description}</em> : null}
                        </div>
                        {!item.outOfMonth ? (
                          <nav className="day-links" aria-label={`${t('dayLinks')} ${item.day} ${t('januaryGenitive')}`}>
                            <Link href={item.prayerSlug ? `/prayers/${item.prayerSlug}` : '/prayers'}>{t('prayers')}</Link>
                            <Link href={item.gospelSlug && item.gospelSlug !== 'today' ? `/gospel/${item.gospelSlug}` : '/gospel'}>{t('gospel')}</Link>
                            <Link href={detailHref}>{t('more')}</Link>
                          </nav>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
                </>
              )}
            </div>
          ) : (
            <p className="calendar-empty">{t('noDays')}</p>
          )}
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
          <Link href={hero?.todayHref || '/gospel'}>{t('read')}</Link>
        </aside>
      </div>

      <section className="calendar-service-grid">
        {services.map((service) => (
          <Link key={service.id} href={service.href || '/'}>
            <span>{service.index}</span>
            <strong>{service.title}</strong>
            <small>{service.description}</small>
          </Link>
        ))}
      </section>
    </section>
  );
}
