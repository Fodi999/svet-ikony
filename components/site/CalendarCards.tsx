'use client';

import Link from 'next/link';
import type { Icon } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import { BrandLogo } from './BrandLogo';
import { useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';
import { SvgIcon } from './SvgIcon';

export type CalendarDayKind = 'feast' | 'fast' | 'gospel' | 'prayer' | 'quiet';

export type CalendarDay = {
  day: string;
  gregorianDate?: string;
  julianDay?: string;
  julianDate?: string;
  label: string;
  note: string;
  kind: CalendarDayKind;
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

type DayActionLabels = {
  prayers: string;
  gospel: string;
  more: string;
};

type DayCommonProps = {
  item: CalendarDay;
  imageUrl: string;
  detailHref: string;
  isToday: boolean;
  dateLabel: string;
  iconFallbackAlt: string;
  openDayLabel: string;
  dayLinksLabel: string;
  monthGenitiveLabel: string;
  actionLabels: DayActionLabels;
};

type HeroLink = {
  href: string;
  label: string;
};

type InfoLink = {
  href: string;
  label: string;
  text: string;
  tone?: 'default' | 'red';
};

function DayStatusMarks({ item }: { item: CalendarDay }) {
  return (
    <>
      {item.current ? <i /> : null}
      {item.feast || item.kind === 'fast' ? <i className="red" /> : null}
    </>
  );
}

function prayerHref(item: CalendarDay, detailHref: string) {
  if (!item.prayerSlug) return '/prayers';
  return detailHref.startsWith('/church/') ? `/church/prayers/${item.prayerSlug}` : `/prayers/${item.prayerSlug}`;
}

function gospelHref(item: CalendarDay, detailHref: string) {
  if (!item.gospelSlug || item.gospelSlug === 'today') return '/gospel';
  return detailHref.startsWith('/church/') ? `/church/gospel/${item.gospelSlug}` : `/gospel/${item.gospelSlug}`;
}

function DayLinks({ item, detailHref, ariaLabel, labels }: { item: CalendarDay; detailHref: string; ariaLabel: string; labels: DayActionLabels }) {
  const localeHref = useLocaleHref();

  return (
    <nav className="day-links" aria-label={ariaLabel}>
      <Link href={localeHref(prayerHref(item, detailHref))}>{labels.prayers}</Link>
      <Link href={localeHref(gospelHref(item, detailHref))}>{labels.gospel}</Link>
      <Link href={localeHref(detailHref)}>{labels.more}</Link>
    </nav>
  );
}

function ListPanelLinks({ item, detailHref, ariaLabel, labels }: { item: CalendarDay; detailHref: string; ariaLabel: string; labels: DayActionLabels }) {
  const localeHref = useLocaleHref();

  return (
    <nav className="list-panel-links" aria-label={ariaLabel}>
      <Link href={localeHref(prayerHref(item, detailHref))}>{labels.prayers}</Link>
      <Link href={localeHref(gospelHref(item, detailHref))}>{labels.gospel}</Link>
      <Link href={localeHref(detailHref)}>{labels.more}</Link>
    </nav>
  );
}

export function CalendarFeatureCard({ eyebrow, title, date, oldDate, note, link }: { eyebrow: string; title: string; date: string; oldDate?: string; note?: string; link: HeroLink }) {
  const localeHref = useLocaleHref();

  return (
    <aside className="calendar-hero-card calendar-feature">
      <p>{eyebrow}</p>
      <span className="gold-cross"><BrandLogo size={96} /></span>
      <strong>{title}</strong>
      <span>{date}{oldDate ? <><br />{oldDate}</> : null}</span>
      {note ? <em>{note}</em> : null}
      <Link href={localeHref(link.href)}>{link.label}<SvgIcon name="arrow-right" size={16} /></Link>
    </aside>
  );
}

export function CalendarImageCard({ imageUrl, imageAlt, eyebrow, title, dateText, link }: { imageUrl?: string; imageAlt: string; eyebrow: string; title: string; dateText: string; link: HeroLink }) {
  const localeHref = useLocaleHref();

  return (
    <aside className="calendar-hero-card calendar-icon-day">
      {imageUrl ? <StableImage src={imageUrl} alt={imageAlt} width={640} height={820} loading="eager" /> : null}
      <div>
        <p>{eyebrow}</p>
        <strong>{title}</strong>
        <span>{dateText}</span>
        <Link href={localeHref(link.href)}>{link.label}<SvgIcon name="arrow-right" size={16} /></Link>
      </div>
    </aside>
  );
}

export function CalendarInfoCard({ eyebrow, title, links }: { eyebrow: string; title: string; links: InfoLink[] }) {
  const localeHref = useLocaleHref();

  return (
    <aside className="calendar-hero-card calendar-info">
      <p>{eyebrow}</p>
      <strong>{title}</strong>
      {links.map((link) => (
        <Link key={link.href} href={localeHref(link.href)}>
          <i className={link.tone === 'red' ? 'red' : undefined} />
          <span><b>{link.label}</b><small>{link.text}</small></span>
        </Link>
      ))}
    </aside>
  );
}

export function CalendarGridDay(props: DayCommonProps & { todayLabel: string }) {
  const { item, imageUrl, detailHref, isToday, dateLabel, todayLabel, iconFallbackAlt, openDayLabel, dayLinksLabel, monthGenitiveLabel, actionLabels } = props;
  const localeHref = useLocaleHref();
  const hasContent = Boolean(item.label);
  const hasImage = Boolean(imageUrl);
  const className = `calendar-day day-kind-${item.kind}${item.textOnly ? ' text-only' : ''}${isToday ? ' today' : ''}${item.outOfMonth ? ' out-of-month' : ''}`;

  if (item.outOfMonth) {
    return <div className={className} aria-hidden="true" />;
  }

  return (
    <article className={className}>
      <div className="day-number">
        {item.day}
        <DayStatusMarks item={item} />
      </div>
      {isToday ? <span className="today-badge">{todayLabel}</span> : null}
      {hasContent && hasImage ? (
        <Link className="day-image-link" href={localeHref(detailHref)} aria-label={`${openDayLabel} ${item.label || iconFallbackAlt}`}>
          <StableImage src={imageUrl} alt={item.icon?.title || item.label || iconFallbackAlt} width={360} height={640} />
        </Link>
      ) : null}
      {hasContent ? (
        <div className="day-event">
          <div className="day-copy">
            <Link className="day-title-link" href={localeHref(detailHref)}>{item.label}</Link>
            {!hasImage ? <span>{item.note}</span> : null}
            {!hasImage && dateLabel ? <span className="day-date-note">{dateLabel}</span> : null}
            {!hasImage && item.description ? <em>{item.description}</em> : null}
          </div>
          <DayLinks item={item} detailHref={detailHref} ariaLabel={`${dayLinksLabel} ${item.day} ${monthGenitiveLabel}`} labels={actionLabels} />
        </div>
      ) : null}
    </article>
  );
}

export function CalendarListDay(props: DayCommonProps & { itemKey: string; isExpanded: boolean; onToggle: () => void; quietLabel: string; monthLabel: string }) {
  const { item, imageUrl, detailHref, isToday, dateLabel, quietLabel, iconFallbackAlt, openDayLabel, dayLinksLabel, monthGenitiveLabel, monthLabel, actionLabels, itemKey, isExpanded, onToggle } = props;
  const localeHref = useLocaleHref();
  const hasContent = Boolean(item.label);

  return (
    <article className={'list-accordion-item' + (isExpanded ? ' open' : '') + (isToday ? ' today' : '')}>
      <button
        className="list-accordion-trigger"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={`${itemKey}-panel`}
        onClick={onToggle}
      >
        <span className="list-day-number">{item.day}<DayStatusMarks item={item} /></span>
        <span className="list-day-heading">
          <strong>{hasContent ? item.label : quietLabel}</strong>
          <small>{hasContent ? item.note : monthLabel}</small>
        </span>
        <span className="list-accordion-mark" aria-hidden="true"><SvgIcon name={isExpanded ? 'minus' : 'plus'} size={18} /></span>
      </button>
      {isExpanded ? (
        <div id={`${itemKey}-panel`} className="list-accordion-panel">
          {imageUrl ? (
            <Link className="list-image-link" href={localeHref(detailHref)} aria-label={`${openDayLabel} ${item.label || iconFallbackAlt}`}>
              <StableImage src={imageUrl} alt={item.icon?.title || item.label || iconFallbackAlt} width={420} height={525} />
            </Link>
          ) : null}
          <div className="list-panel-copy">
            <p>{hasContent ? item.note : quietLabel}</p>
            <h3>{hasContent ? item.label : `${item.day} ${monthLabel}`}</h3>
            {dateLabel ? <small>{dateLabel}</small> : null}
            {item.description ? <span>{item.description}</span> : <span>{monthLabel}</span>}
            {hasContent ? (
              <ListPanelLinks item={item} detailHref={detailHref} ariaLabel={`${dayLinksLabel} ${item.day} ${monthGenitiveLabel}`} labels={actionLabels} />
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function CalendarServiceCard({ href, index, title, description }: { href: string; index: string; title: string; description: string }) {
  const localeHref = useLocaleHref();

  return (
    <Link href={localeHref(href || '/')}>
      <span>{index}</span>
      <strong>{title}</strong>
      <small>{description}</small>
    </Link>
  );
}
