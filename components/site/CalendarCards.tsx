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

// Matches what used to be the shared .card base (components.css, deleted
// once the Tailwind migration finished) — reimplemented directly here.
const heroCardBaseClass =
  "relative min-w-0 self-start overflow-hidden grid content-start gap-3 min-h-[210px] p-[clamp(16px,1.6vw,24px)] rounded-md border border-gold/28 " +
  "bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] text-foreground " +
  "shadow-[0_6px_18px_rgba(0,0,0,.18)] transition-[border-color,background,box-shadow,transform] duration-[180ms] ease-brand " +
  "hover:-translate-y-px hover:border-gold hover:bg-[linear-gradient(135deg,rgba(205,164,90,.095),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.075),transparent_60%),#1b1c16] " +
  "focus-within:-translate-y-px focus-within:border-gold focus-within:bg-[linear-gradient(135deg,rgba(205,164,90,.095),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.075),transparent_60%),#1b1c16] " +
  "max-[900px]:min-h-0 max-[900px]:p-4 max-[520px]:rounded-[18px] max-[430px]:p-3 max-[430px]:gap-[9px]";

const heroEyebrowClass = "relative z-[2] mb-2 text-[12px] font-black tracking-[.12em] text-muted-foreground uppercase max-[520px]:mb-1.5";

const dayKindBeforeClass: Record<CalendarDayKind, string> = {
  feast: 'before:bg-[#a97832]',
  fast: 'before:bg-[#9a3b42]',
  gospel: 'before:bg-[#536c82]',
  prayer: 'before:bg-[#7f8d65]',
  quiet: 'before:bg-gold/28'
};

const dayKindNoteClass: Record<CalendarDayKind, string> = {
  feast: 'text-gold-light',
  fast: 'text-[#efbac0]',
  gospel: 'text-[#bfd4e6]',
  prayer: 'text-[#d0ddc3]',
  quiet: 'text-gold-light'
};

function DayStatusMarks({ item }: { item: CalendarDay }) {
  return (
    <>
      {item.current ? <i className="inline-block size-[11px] flex-none rounded-[3px] bg-gold" /> : null}
      {item.feast || item.kind === 'fast' ? <i className="inline-block size-[11px] flex-none rounded-[3px] bg-[#9a3b42]" /> : null}
    </>
  );
}

function prayerHref(item: CalendarDay) {
  return item.prayerSlug ? `/prayers/${item.prayerSlug}` : '/prayers';
}

function gospelHref(item: CalendarDay, detailHref: string) {
  if (!item.gospelSlug || item.gospelSlug === 'today') return '/gospel';
  return detailHref.startsWith('/church/') ? `/church/gospel/${item.gospelSlug}` : `/gospel/${item.gospelSlug}`;
}

function DayLinks({ item, detailHref, ariaLabel, labels, onImage }: { item: CalendarDay; detailHref: string; ariaLabel: string; labels: DayActionLabels; onImage: boolean }) {
  const localeHref = useLocaleHref();
  const linkClass = onImage
    ? "inline-flex min-h-6 items-center text-[13px] font-extrabold leading-[1.3] text-white/82 no-underline [&+&]:before:content-['|'] [&+&]:before:mr-2 [&+&]:before:text-white/20"
    : "inline-flex min-h-6 items-center text-[13px] font-extrabold leading-[1.3] text-muted-foreground no-underline hover:text-gold-light [&+&]:before:content-['|'] [&+&]:before:mr-2 [&+&]:before:text-gold/28";

  return (
    <nav className={`relative z-[3] col-span-full flex flex-wrap gap-2 mt-2.5 border-t pt-2.5 ${onImage ? 'border-t-white/18' : 'border-t-gold/28'}`} aria-label={ariaLabel}>
      <Link className={linkClass} href={localeHref(prayerHref(item))}>{labels.prayers}</Link>
      <Link className={linkClass} href={localeHref(gospelHref(item, detailHref))}>{labels.gospel}</Link>
      <Link className={linkClass} href={localeHref(detailHref)}>{labels.more}</Link>
    </nav>
  );
}

function ListPanelLinks({ item, detailHref, ariaLabel, labels }: { item: CalendarDay; detailHref: string; ariaLabel: string; labels: DayActionLabels }) {
  const localeHref = useLocaleHref();
  // Reimplements the shared "ghost button" from components.css's .btn system
  // (still owned there for the rest of the site — Phase 6 territory).
  const linkClass =
    "inline-flex min-h-[38px] items-center justify-center gap-2 rounded-md border border-gold/28 bg-gold/8 px-3.5 text-[13px] font-black tracking-[.06em] text-gold-light uppercase leading-[1.15] no-underline whitespace-nowrap transition-[border-color,background,color,transform] duration-[180ms] ease-brand hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas";

  return (
    <nav className="flex flex-wrap gap-2.5 mt-2.5" aria-label={ariaLabel}>
      <Link className={linkClass} href={localeHref(prayerHref(item))}>{labels.prayers}</Link>
      <Link className={linkClass} href={localeHref(gospelHref(item, detailHref))}>{labels.gospel}</Link>
      <Link className={linkClass} href={localeHref(detailHref)}>{labels.more}</Link>
    </nav>
  );
}

export function CalendarFeatureCard({ eyebrow, title, date, oldDate, note, link }: { eyebrow: string; title: string; date: string; oldDate?: string; note?: string; link: HeroLink }) {
  const localeHref = useLocaleHref();

  return (
    <aside className={heroCardBaseClass}>
      <p className={heroEyebrowClass}>{eyebrow}</p>
      <span className="absolute top-[clamp(16px,1.6vw,24px)] right-[clamp(16px,1.6vw,24px)] z-[1] grid place-items-center size-[clamp(72px,5.4vw,96px)] text-gold opacity-[.42] pointer-events-none max-[520px]:top-4 max-[520px]:right-3.5 max-[520px]:size-[66px] max-[520px]:opacity-[.34]">
        <BrandLogo size={96} className="h-full w-full" />
      </span>
      <strong className="relative z-[2] block min-w-0 max-w-full pr-[clamp(56px,4vw,92px)] text-[clamp(18px,1.05vw,23px)] font-extrabold leading-[1.14] text-foreground text-balance [overflow-wrap:anywhere] max-[900px]:text-[clamp(20px,4.8vw,28px)] max-[900px]:leading-[1.12] max-[520px]:text-[clamp(19px,5vw,25px)] max-[520px]:pr-12">
        {title}
      </strong>
      <span className="relative z-[2] block min-w-0 max-w-full text-[clamp(14px,1vw,18px)] leading-[1.35] text-foreground [overflow-wrap:anywhere] max-[520px]:text-[15px] max-[520px]:whitespace-normal">
        {date}
        {oldDate ? <><br />{oldDate}</> : null}
      </span>
      {note ? (
        <em className="relative z-[2] block min-w-0 max-w-full text-[clamp(14px,1vw,17px)] not-italic leading-[1.35] text-muted-foreground [overflow-wrap:anywhere] max-[520px]:text-[15px] max-[520px]:whitespace-normal">
          {note}
        </em>
      ) : null}
      <Link
        className="relative z-[2] mt-auto inline-flex w-max max-w-full items-center gap-[7px] border-b-2 border-gold font-extrabold text-gold-light [overflow-wrap:anywhere] max-[520px]:text-[16px]"
        href={localeHref(link.href)}
      >
        {link.label}
        <SvgIcon name="arrow-right" size={16} />
      </Link>
    </aside>
  );
}

export function CalendarImageCard({ imageUrl, imageAlt, eyebrow, title, dateText, link }: { imageUrl?: string; imageAlt: string; eyebrow: string; title: string; dateText: string; link: HeroLink }) {
  const localeHref = useLocaleHref();

  return (
    <aside className="group relative min-w-0 self-start overflow-hidden grid grid-cols-1 content-stretch min-h-[360px] aspect-[4/4.8] p-0 rounded-md border border-gold/28 bg-[#141511] text-white shadow-[0_6px_18px_rgba(0,0,0,.18)] transition-[border-color,box-shadow,transform] duration-[180ms] ease-brand hover:-translate-y-px hover:border-gold focus-within:-translate-y-px focus-within:border-gold after:content-[''] after:absolute after:inset-0 after:z-[2] after:pointer-events-none after:bg-[linear-gradient(180deg,transparent_0%,transparent_42%,rgba(8,8,7,.44)_62%,rgba(8,8,7,.94)_100%)] max-[900px]:min-h-0 max-[520px]:min-h-[360px] max-[520px]:aspect-[4/5.25] max-[430px]:min-h-[178px]">
      {imageUrl ? (
        <StableImage
          src={imageUrl}
          alt={imageAlt}
          width={640}
          height={820}
          loading="eager"
          className="absolute inset-0 z-[1] size-full border-0 bg-[#1b1c16] object-cover object-[center_top] [filter:grayscale(.03)_saturate(.95)_contrast(1.02)_brightness(.86)] transition-[filter,transform] duration-[180ms] ease-brand group-hover:[filter:grayscale(.02)_saturate(.96)_contrast(1.02)_brightness(.8)] group-hover:scale-[1.012]"
        />
      ) : null}
      <div className="relative z-[3] grid gap-[7px] content-end min-h-full p-[clamp(16px,1.6vw,24px)] pt-[48%] max-[430px]:p-3">
        <p className="relative z-[2] mb-0 text-[12px] font-black tracking-[.12em] text-white/72 uppercase max-[520px]:mb-1.5">{eyebrow}</p>
        <strong className="relative z-[2] block min-w-0 max-w-[16ch] text-[clamp(20px,1.5vw,27px)] font-extrabold leading-[1.04] text-white [text-shadow:0_2px_16px_rgba(0,0,0,.45)] line-clamp-5 [overflow-wrap:anywhere] max-[900px]:text-[clamp(20px,4.8vw,28px)] max-[900px]:leading-[1.12] max-[520px]:max-w-[15ch] max-[520px]:text-[clamp(19px,5vw,25px)] max-[520px]:leading-[1.12]">
          {title}
        </strong>
        <span className="relative z-[2] block min-w-0 max-w-[18ch] text-[clamp(14px,1vw,18px)] leading-[1.35] text-white/86 [text-shadow:0_2px_14px_rgba(0,0,0,.45)] [overflow-wrap:anywhere] max-[520px]:text-[15px] max-[520px]:whitespace-normal">
          {dateText}
        </span>
        <Link
          className="relative z-[2] mt-auto inline-flex w-max max-w-full items-center gap-[7px] border-b-2 border-gold text-white [text-shadow:0_2px_14px_rgba(0,0,0,.45)] font-extrabold [overflow-wrap:anywhere] max-[520px]:text-[16px]"
          href={localeHref(link.href)}
        >
          {link.label}
          <SvgIcon name="arrow-right" size={16} />
        </Link>
      </div>
    </aside>
  );
}

export function CalendarInfoCard({ eyebrow, title, links }: { eyebrow: string; title: string; links: InfoLink[] }) {
  const localeHref = useLocaleHref();

  return (
    <aside className={heroCardBaseClass}>
      <p className={heroEyebrowClass}>{eyebrow}</p>
      <strong className="relative z-[2] text-[clamp(20px,1.4vw,28px)] font-black leading-[1.05] text-foreground max-[520px]:whitespace-normal max-[520px]:[overflow-wrap:anywhere]">
        {title}
      </strong>
      {links.map((link) => (
        <Link
          key={link.href}
          href={localeHref(link.href)}
          className="grid grid-cols-[12px_minmax(0,1fr)] items-center gap-2.5 min-h-[54px] border-t border-t-[rgba(232,211,169,.13)] border-b-0 pt-2.5 text-gold-light no-underline font-extrabold transition-colors duration-[180ms] ease-brand hover:text-gold max-[520px]:min-h-[52px] max-[520px]:grid-cols-[10px_minmax(0,1fr)]"
        >
          <i className={`inline-block size-[11px] flex-none rounded-[3px] ${link.tone === 'red' ? 'bg-[#9a3b42]' : 'bg-gold'}`} />
          <span className="grid gap-0.5 text-current">
            <b className="text-[clamp(15px,1vw,18px)] leading-[1.1] max-[520px]:whitespace-normal max-[520px]:[overflow-wrap:anywhere]">{link.label}</b>
            <small className="text-[12px] font-extrabold leading-[1.15] text-muted-foreground">{link.text}</small>
          </span>
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

  if (item.outOfMonth) {
    return <div className="pointer-events-none" aria-hidden="true" />;
  }

  const sizeClass = hasContent
    ? hasImage
      ? 'min-h-0 p-0'
      : 'min-h-0 pt-[58px] px-3.5 pb-3.5'
    : isToday
      ? 'min-h-[94px]'
      : 'min-h-[72px]';
  const stateClass = isToday
    ? 'border-gold shadow-[inset_0_0_0_1px_rgba(214,168,79,.22)]'
    : 'focus-within:border-gold focus-within:shadow-[inset_0_0_0_1px_rgba(214,168,79,.22)]';
  const imageOverlayClass = hasImage
    ? " after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-[68%] after:pointer-events-none after:bg-[linear-gradient(180deg,transparent_0%,rgba(20,14,9,.42)_38%,rgba(12,8,5,.86)_100%)] after:opacity-[.84] after:transition-opacity after:duration-[180ms] after:ease-brand hover:after:opacity-[.96] focus-within:after:opacity-[.96]"
    : '';

  return (
    <article
      className={`group relative min-w-0 grid gap-2 rounded-md border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.055),transparent_50%),linear-gradient(160deg,rgba(127,141,101,.045),transparent_60%),#141511] text-foreground overflow-clip transition-[border-color,box-shadow,background] duration-[180ms] ease-brand hover:border-gold hover:bg-[#1b1c16] before:absolute before:inset-y-0 before:left-0 before:z-[4] before:w-1 before:content-[''] ${isToday ? 'before:opacity-100' : 'before:opacity-[.62]'} ${dayKindBeforeClass[item.kind]} ${sizeClass} ${stateClass}${imageOverlayClass}`}
    >
      <div
        className={
          hasImage
            ? 'absolute top-2.5 left-2.5 z-[5] flex w-max min-h-[38px] items-center gap-[7px] rounded-xs border border-gold/28 bg-[rgba(11,11,10,.82)] px-2.5 font-serif text-[28px] leading-none text-foreground [font-variant-numeric:tabular-nums]'
            : 'absolute top-2.5 left-2.5 z-[5] flex min-h-[34px] items-center gap-[7px] rounded-xs border border-gold/28 bg-[rgba(11,11,10,.82)] px-2.5 font-serif text-[28px] leading-none text-foreground [font-variant-numeric:tabular-nums]'
        }
      >
        {item.day}
        <DayStatusMarks item={item} />
      </div>
      {isToday ? (
        <span className="absolute top-[50px] left-2.5 z-[5] max-w-[calc(100%-20px)] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-gold/28 bg-[rgba(11,11,10,.82)] px-2.5 py-1 font-serif text-[15px] font-extrabold text-gold-light max-[520px]:px-1.5 max-[520px]:py-0.5 max-[520px]:text-[11px] max-[360px]:text-[10px]">
          {todayLabel}
        </span>
      ) : null}
      {hasContent && hasImage ? (
        <Link
          className="relative col-span-full z-0 block min-w-0 self-start w-full aspect-[9/16] overflow-hidden bg-[linear-gradient(110deg,transparent_0_28%,rgba(241,209,138,.16)_42%,transparent_56%),#1b1c16] bg-[length:220%_100%,100%_100%] [animation:imageSkeleton_1.4s_ease-in-out_infinite] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px]"
          href={localeHref(detailHref)}
          aria-label={`${openDayLabel} ${item.label || iconFallbackAlt}`}
        >
          <StableImage
            src={imageUrl}
            alt={item.icon?.title || item.label || iconFallbackAlt}
            width={360}
            height={640}
            className="relative z-[2] size-full aspect-[9/16] object-cover object-center [filter:saturate(.98)_contrast(1.02)] transition-[filter,transform] duration-[180ms] ease-brand group-hover:[filter:saturate(1.02)_contrast(1.02)] group-hover:scale-[1.006] group-focus-within:[filter:saturate(1.02)_contrast(1.02)] group-focus-within:scale-[1.006]"
          />
        </Link>
      ) : null}
      {hasContent ? (
        <div
          className={
            hasImage
              ? "absolute inset-x-3 bottom-3 z-[3] grid grid-cols-1 gap-0 min-h-0 rounded-xs border border-[rgba(214,168,79,.28)] bg-[rgba(11,11,10,.72)] p-3 text-white backdrop-blur-[8px] opacity-0 translate-y-3 pointer-events-none transition-[opacity,transform] duration-[180ms] ease-brand group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto"
              : 'relative z-[3] grid grid-cols-1 gap-0 min-w-0 rounded-xs border border-gold/28 bg-[rgba(11,11,10,.92)] p-3.5 text-foreground'
          }
        >
          <div className={`relative z-[3] min-w-0 grid gap-[7px] text-[14px] leading-[1.4] ${hasImage ? 'text-white' : 'text-muted-foreground'}`}>
            <Link
              className={`block text-[15px] font-black leading-[1.3] [hyphens:auto] [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px] ${hasImage ? 'text-white text-[16px] leading-[1.12]' : 'text-gold-light'}`}
              href={localeHref(detailHref)}
            >
              {item.label}
            </Link>
            {!hasImage ? <span className={`block font-bold leading-[1.35] [overflow-wrap:anywhere] ${dayKindNoteClass[item.kind]}`}>{item.note}</span> : null}
            {!hasImage && dateLabel ? <span className="block font-bold leading-[1.35] text-muted-foreground [overflow-wrap:anywhere]">{dateLabel}</span> : null}
            {!hasImage && item.description ? (
              <em className="block not-italic text-[13px] leading-[1.4] text-muted-foreground [overflow-wrap:anywhere]">{item.description}</em>
            ) : null}
          </div>
          <DayLinks item={item} detailHref={detailHref} ariaLabel={`${dayLinksLabel} ${item.day} ${monthGenitiveLabel}`} labels={actionLabels} onImage={hasImage} />
        </div>
      ) : null}
    </article>
  );
}

export function CalendarListDay(props: DayCommonProps & { itemKey: string; isExpanded: boolean; onToggle: () => void; quietLabel: string; monthLabel: string }) {
  const { item, imageUrl, detailHref, dateLabel, quietLabel, iconFallbackAlt, openDayLabel, dayLinksLabel, monthGenitiveLabel, monthLabel, actionLabels, itemKey, isExpanded, onToggle } = props;
  const localeHref = useLocaleHref();
  const hasContent = Boolean(item.label);

  return (
    <article className={`border-b border-gold/28 transition-colors duration-[180ms] ease-brand hover:bg-[#1b1c16] ${isExpanded ? 'bg-[#1b1c16]' : 'bg-transparent'}`}>
      <button
        className="grid w-full min-h-[92px] grid-cols-[minmax(76px,108px)_minmax(0,1fr)_42px] items-center gap-[clamp(16px,2vw,34px)] border-0 bg-transparent px-0 py-[18px] text-left text-foreground cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px] max-[900px]:min-h-[78px] max-[900px]:grid-cols-[minmax(58px,76px)_minmax(0,1fr)_38px] max-[900px]:gap-3.5 max-[520px]:grid-cols-[56px_minmax(0,1fr)_34px] max-[520px]:py-3.5"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={`${itemKey}-panel`}
        onClick={onToggle}
      >
        <span className="flex items-center gap-[7px] font-serif text-[clamp(28px,3vw,52px)] leading-none text-foreground [font-variant-numeric:tabular-nums] max-[520px]:text-[30px]">
          {item.day}
          <DayStatusMarks item={item} />
        </span>
        <span className="grid min-w-0 gap-1.5">
          <strong className="max-w-[880px] text-[clamp(18px,2vw,34px)] font-black leading-[1.05] text-foreground [overflow-wrap:anywhere] max-[520px]:text-[18px]">
            {hasContent ? item.label : quietLabel}
          </strong>
          <small className="text-[14px] font-black text-gold-light">{hasContent ? item.note : monthLabel}</small>
        </span>
        <span className="grid size-[42px] place-items-center justify-self-end rounded-full border border-gold/28 text-[26px] leading-none text-gold-light max-[900px]:size-[38px]" aria-hidden="true">
          <SvgIcon name={isExpanded ? 'minus' : 'plus'} size={18} />
        </span>
      </button>
      {isExpanded ? (
        <div id={`${itemKey}-panel`} className="grid grid-cols-[minmax(180px,280px)_minmax(0,760px)] gap-[clamp(20px,3vw,54px)] pt-0 pr-0 pb-[clamp(28px,4vw,58px)] pl-[clamp(92px,7vw,142px)] max-[900px]:grid-cols-1 max-[900px]:pl-0">
          {imageUrl ? (
            <Link
              className="relative block min-w-0 overflow-hidden rounded-[8px] border border-gold/28 bg-[linear-gradient(110deg,transparent_0_28%,rgba(241,209,138,.16)_42%,transparent_56%),#1b1c16] bg-[length:220%_100%,100%_100%] [animation:imageSkeleton_1.4s_ease-in-out_infinite] max-[900px]:max-w-[280px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px]"
              href={localeHref(detailHref)}
              aria-label={`${openDayLabel} ${item.label || iconFallbackAlt}`}
            >
              <StableImage
                src={imageUrl}
                alt={item.icon?.title || item.label || iconFallbackAlt}
                width={420}
                height={525}
                className="relative z-[1] block w-full aspect-[4/5] object-cover object-[center_top]"
              />
            </Link>
          ) : null}
          <div className="grid min-w-0 content-start gap-3.5">
            <p className="m-0 text-[13px] font-black tracking-[.08em] text-gold-light uppercase">{hasContent ? item.note : quietLabel}</p>
            <h3 className="m-0 max-w-[760px] font-serif text-[clamp(26px,3.4vw,54px)] font-bold leading-[1.02] text-foreground [overflow-wrap:anywhere] max-[900px]:text-[clamp(28px,12vw,52px)]">
              {hasContent ? item.label : `${item.day} ${monthLabel}`}
            </h3>
            {dateLabel ? <small className="text-[13px] font-black text-muted-foreground">{dateLabel}</small> : null}
            <span className="max-w-[680px] text-[clamp(17px,1.5vw,24px)] leading-[1.35] text-muted-foreground">{item.description || monthLabel}</span>
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
    <Link
      href={localeHref(href || '/')}
      className="relative min-h-[140px] grid content-start gap-4 rounded-[8px] border border-gold/28 p-[clamp(18px,2vw,28px)] bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_48%),linear-gradient(160deg,rgba(83,108,130,.055),transparent_64%),#141511] text-foreground overflow-hidden transition-[border-color,background,transform] duration-[180ms] ease-brand hover:border-gold hover:bg-[#1b1c16] hover:-translate-y-px before:content-[''] before:absolute before:top-2.5 before:right-2.5 before:size-7 before:border-t before:border-r before:border-gold before:opacity-50 before:pointer-events-none"
    >
      <span className="text-gold-light font-black">{index}</span>
      <strong className="font-serif text-[clamp(20px,1.7vw,30px)] font-bold leading-[1.05]">{title}</strong>
      <small className="text-[15px] leading-[1.35] text-muted-foreground">{description}</small>
    </Link>
  );
}
