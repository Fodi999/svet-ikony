'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CalendarContent, GospelReading, Icon, Prayer, SeoPage } from '@/lib/types';

type DayKind = 'feast' | 'fast' | 'gospel' | 'prayer' | 'quiet';
type FilterKind = 'all' | DayKind;
type ViewMode = 'calendar' | 'list';

const months = [
  { title: 'Январь', days: 31 },
  { title: 'Февраль', days: 28 },
  { title: 'Март', days: 31 },
  { title: 'Апрель', days: 30 },
  { title: 'Май', days: 31 },
  { title: 'Июнь', days: 30 },
  { title: 'Июль', days: 31 },
  { title: 'Август', days: 31 },
  { title: 'Сентябрь', days: 30 },
  { title: 'Октябрь', days: 31 },
  { title: 'Ноябрь', days: 30 },
  { title: 'Декабрь', days: 31 }
];

type CalendarDay = {
  day: string;
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
};

const filterLabels: Record<FilterKind, string> = {
  all: 'Все дни',
  feast: 'Праздники / иконы',
  fast: 'Пост / особые дни',
  gospel: 'Евангелие',
  prayer: 'Молитвы',
  quiet: 'Тихие дни'
};

function normalizeLookup(value?: string) {
  return (value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
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

function createMonthDays(icons: Icon[], prayers: Prayer[], gospel: GospelReading, calendar?: CalendarContent): CalendarDay[] {
  if (calendar?.days?.length) {
    return fillMonthDays(calendar.days.map((day) => {
      const icon = findCalendarIcon(icons, day);

      return {
        day: day.day,
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
    }), 31);
  }

  return fillMonthDays([
    { day: '01', label: 'Обрезание Господне', note: 'Праздник', kind: 'feast', icon: icons[0], current: true, description: 'Память события и начало годового молитвенного круга.' },
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
    { day: '14', label: 'Святитель Василий Великий', note: 'Память святого', kind: 'feast', icon: icons[1], current: true, description: 'Память святителя и учителя Церкви.' },
    { day: '15', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '16', label: 'Икона Божией Матери «Умиление»', note: 'Праздничная икона', kind: 'feast', icon: icons[0], description: 'Молитва о мире сердца и покаянии.' },
    { day: '17', label: '', note: '', kind: 'quiet', textOnly: true },
    { day: '18', label: gospel.reference ? 'Неделя 32-я по Пятидесятнице' : 'Евангельское чтение', note: 'Евангельское чтение', kind: 'gospel', icon: icons[0], description: gospel.text }
  ], 31);
}

function createQuietMonth(totalDays: number): CalendarDay[] {
  return fillMonthDays([], totalDays);
}

function monthIndexFromTitle(title?: string) {
  const normalized = normalizeLookup(title);
  const index = months.findIndex((month) => normalized.includes(normalizeLookup(month.title)));
  return index >= 0 ? index : 0;
}

export function CalendarView({ icons, prayers, gospel, pages = [], calendar }: { icons: Icon[]; prayers: Prayer[]; gospel: GospelReading; pages?: SeoPage[]; calendar?: CalendarContent }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [view, setView] = useState<ViewMode>('calendar');
  const hero = calendar?.hero;
  const year = hero?.year ?? '2026';
  const [monthIndex, setMonthIndex] = useState(() => monthIndexFromTitle(hero?.monthTitle));
  const januaryDays = useMemo(() => createMonthDays(icons, prayers, gospel, calendar), [icons, prayers, gospel, calendar]);
  const days = useMemo(() => monthIndex === 0 ? januaryDays : createQuietMonth(months[monthIndex].days), [januaryDays, monthIndex]);
  const visibleDays = filter === 'all' ? days : days.filter((day) => day.kind === filter);
  const today = days.find((day) => day.day === '14') ?? days.find((day) => day.current) ?? days[0];
  const prevMonth = months[(monthIndex + 11) % 12];
  const nextMonth = months[(monthIndex + 1) % 12];
  const monthTitle = `${months[monthIndex].title} ${year}`;
  const iconOfDay = icons.find((icon) => icon.slug === hero?.iconDayIconSlug) ?? icons[1] ?? icons[0];
  const prayerOfDay = prayers.find((prayer) => prayer.slug === hero?.iconDayPrayerSlug) ?? prayers[0];
  const services = calendar?.services?.length ? calendar.services : [
    { id: 'service-prayers', index: '01', title: 'Молитвы на каждый день', description: 'Краткое правило и молитвы перед иконой.', href: '/prayers' },
    { id: 'service-gospel', index: '02', title: 'Евангелие дня', description: 'Чтение, ссылка и спокойное объяснение.', href: '/gospel' },
    { id: 'service-feasts', index: '03', title: 'Праздники и посты', description: 'Церковные даты, важные дни и отметки.', href: '/p/pravoslavnaya-ikona-s-qr-kodom' },
    { id: 'service-icons', index: '04', title: 'Иконы святых', description: 'История образов, жития и QR-страницы.', href: '/icons' }
  ];

  return (
    <section className="calendar-page">
      <div className="calendar-topline">
        <Link className="calendar-logo" href="/">
          <span className="orthodox-cross">☦</span>
          <span><strong>Молитва у иконы</strong><small>Православный портал</small></span>
        </Link>
        <span>Главная <b>/</b> Календарь</span>
      </div>

      <section className="calendar-hero">
        <div>
          <span className="calendar-year">{hero?.year ?? '2026'}</span>
          <h1>{hero?.title ?? 'Свет Иконы'}</h1>
        </div>
        <aside className="calendar-feature">
          <p>Праздник дня</p>
          <strong><span className="gold-cross">☦</span> {hero?.featureTitle ?? 'Святитель Василий Великий'}</strong>
          <span>{hero?.featureNote ?? 'Память святого'}<br />{hero?.featureDate ?? '14 января (ст. ст.)'}</span>
          <Link href={hero?.featureHref || '/saints/nikolay-chudotvorets'}>О празднике →</Link>
        </aside>
        <aside className="calendar-icon-day">
          {iconOfDay ? <img src={iconOfDay.imageUrl} alt={iconOfDay.title} /> : null}
          <div>
            <p>Икона дня</p>
            <strong>{hero?.iconDayTitle || iconOfDay?.title || 'Икона дня'}</strong>
            <span>{hero?.iconDayDate ?? '14 января 2026'}</span>
            <Link href={prayerOfDay ? `/prayers/${prayerOfDay.slug}` : '/prayers'}>Открыть молитву →</Link>
          </div>
        </aside>
        <aside className="calendar-info">
          <p>Информация</p>
          <span><i /> {hero?.infoPrimary ?? 'Сегодняшний праздник'}</span>
          <span><i className="red" /> {hero?.infoSecondary ?? 'Важный день'}</span>
        </aside>
      </section>

      <div className="calendar-toolbar">
        <div className="month-switch">
          <button type="button" onClick={() => setMonthIndex((index) => (index + 11) % 12)}>← {prevMonth.title}</button>
          <strong>{monthTitle}</strong>
          <button type="button" onClick={() => setMonthIndex((index) => (index + 1) % 12)}>{nextMonth.title} →</button>
        </div>
        <div className="calendar-filter">
          <button className="filter-toggle" type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
            <span>Фильтр: {filterLabels[filter]}</span><i aria-hidden="true">⌄</i>
          </button>
          {filterOpen ? (
            <div className="filter-menu">
              {(Object.keys(filterLabels) as FilterKind[]).map((kind) => (
                <button
                  key={kind}
                  className={filter === kind ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    setFilter(kind);
                    setFilterOpen(false);
                  }}
                >
                  {filterLabels[kind]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="view-switch" role="group" aria-label="Вид календаря">
          <button className={view === 'calendar' ? 'active' : ''} type="button" onClick={() => setView('calendar')}>Календарь</button>
          <span>|</span>
          <button className={view === 'list' ? 'active' : ''} type="button" onClick={() => setView('list')}>Список</button>
        </div>
      </div>

      <div className="calendar-main">
        <section className="month-block">
          <h2>{months[monthIndex].title}</h2>
          {visibleDays.length ? (
            <div className={view === 'list' ? 'calendar-list' : 'calendar-grid'}>
              {visibleDays.map((item) => {
                const imageUrl = item.imageUrl || item.icon?.imageUrl || '';
                const detailHref = pageHrefForDay(item, pages);

                return (
                  <article key={item.day} className={'calendar-day' + (item.textOnly ? ' text-only' : '') + (item.day === today.day ? ' today' : '')}>
                    <div className="day-number">{item.day}{item.current ? <i /> : null}{item.feast || item.kind === 'fast' ? <i className="red" /> : null}</div>
                    {item.day === today.day ? <span className="today-badge">Сегодня</span> : null}
                    {imageUrl && view === 'calendar' ? (
                      <Link className="day-image-link" href={detailHref} aria-label={`Открыть ${item.label || 'икону дня'}`}>
                        <img src={imageUrl} alt={item.icon?.title || item.label || 'Икона дня'} />
                      </Link>
                    ) : null}
                    <div className="day-copy">
                      {item.label ? <Link className="day-title-link" href={detailHref}>{item.label}</Link> : <strong>{item.label}</strong>}
                      <span>{item.note}</span>
                      {item.description ? <em>{item.description}</em> : null}
                      {item.label ? (
                        <nav className="day-links" aria-label={`Ссылки на ${item.day} января`}>
                          <Link href={item.prayerSlug ? `/prayers/${item.prayerSlug}` : '/prayers'}>Молитва</Link>
                          <Link href={item.gospelSlug && item.gospelSlug !== 'today' ? `/gospel/${item.gospelSlug}` : '/gospel'}>Евангелие</Link>
                          <Link href={detailHref}>Подробнее</Link>
                        </nav>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="calendar-empty">Нет дней по выбранному фильтру.</p>
          )}
        </section>

        <aside className="today-card">
          <p>Сегодня</p>
          <strong>{hero?.todayDate ?? '14 января 2026'}</strong>
          <dl>
            <dt>Праздник дня</dt>
            <dd>{today?.label}</dd>
            <dt>Евангелие дня</dt>
            <dd>{hero?.todayGospel || gospel.reference}</dd>
            <dt>Молитва дня</dt>
            <dd>{hero?.todayPrayerTitle || prayerOfDay?.title}</dd>
          </dl>
          <Link href={hero?.todayHref || '/gospel'}>Читать</Link>
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
