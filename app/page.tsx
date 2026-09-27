import { CalendarExperience } from '@/components/site/visualizer-cesium/CalendarExperience';
import { Hreflang } from '@/components/site/Hreflang';
import { buildCalendarHero } from '@/lib/api';
import { jsonLd } from '@/lib/seo';
import { shellMetadata } from '@/lib/shell-metadata';
import { getRequestLocale } from '@/lib/serverLocale';

export const revalidate = 0;

/**
 * PHASE MULTILINGUAL-1 / P0.6: the homepage previously had NO
 * generateMetadata() at all, so /uk, /ru, /en all inherited only the root
 * layout's static `metadata` export -- which has no `alternates` at all --
 * leaving `/`, `/uk`, `/ru`, `/en` with no <link rel="canonical"> whatsoever
 * (every inner page already had one via pageMetadata()). Self-referencing
 * per locale (NOT canonicalized onto /uk): /uk -> canonical /uk, /ru ->
 * canonical /ru, /en -> canonical /en, matching the same policy every
 * detail/list page already follows.
 */
export async function generateMetadata() {
  const locale = await getRequestLocale();
  return shellMetadata('/', locale);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedMonth(value: string | undefined) {
  const month = Number(value);
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
}

function normalizedYear(value: string | undefined) {
  const year = Number(value);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

/**
 * Homepage shell copy (GlobeShell pilot): kept minimal and file-local since
 * this text exists purely as the semantic SSR fallback below, not as UI a
 * person interacts with -- see the comment on <section id="home-intro">.
 */
const homeShellCopy = {
  uk: { h1: 'Svet Ikony — православний глобус свят, святинь і храмів', intro: (month: string) => `Інтерактивна мапа православних святинь, храмів і місць памʼяті святих разом із церковним календарем на ${month}. Оберіть святиню на глобусі або перейдіть до розділів нижче.`, links: { saints: 'Святі', icons: 'Ікони', prayers: 'Молитви', shop: 'Магазин', history: 'Православна історія' } },
  ru: { h1: 'Svet Ikony — православный глобус праздников, святынь и храмов', intro: (month: string) => `Интерактивная карта православных святынь, храмов и мест памяти святых вместе с церковным календарём на ${month}. Выберите святыню на глобусе или перейдите в разделы ниже.`, links: { saints: 'Святые', icons: 'Иконы', prayers: 'Молитвы', shop: 'Магазин', history: 'Православная история' } },
  en: { h1: 'Svet Ikony — an Orthodox globe of feasts, shrines and churches', intro: (month: string) => `An interactive map of Orthodox shrines, churches and places tied to the saints, together with the church calendar for ${month}. Pick a shrine on the globe or jump to a section below.`, links: { saints: 'Saints', icons: 'Icons', prayers: 'Prayers', shop: 'Shop', history: 'Orthodox history' } }
} as const;

/**
 * GlobeShell homepage. Deliberately does NOT fetch listCalendarDays/
 * listPrayers/composeCalendarPages the way this page used to (when it
 * rendered <CalendarView>) -- ТЗ п.18 asks the homepage's initial load to
 * stay lightweight (place catalog only, no eager per-day/per-shrine
 * content), and now that CalendarExperience (the globe) is what actually
 * renders here, that whole SSR day-listing pass was dead weight: the only
 * thing still read from it was calendar.hero.monthTitle, which
 * buildCalendarHero() computes synchronously from year/month with no DB
 * call at all. CalendarView and the heavier fetch chain still exist and
 * are exercised by /pravoslavna-istoriya's own history-mode branch and by
 * other pages -- nothing about them was removed, this page just stopped
 * needing them.
 */
export default async function HomePage({ searchParams }: { searchParams?: Promise<{ year?: string | string[]; month?: string | string[] }> }) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const year = normalizedYear(firstParam(params?.year));
  const month = normalizedMonth(firstParam(params?.month));
  const hero = buildCalendarHero(year, month);
  const copy = homeShellCopy[locale] ?? homeShellCopy.uk;
  return (
    <main className="min-h-dvh bg-canvas p-0">
      <Hreflang locale={locale} path="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Organization', { name: 'svetikony.com', url: 'https://svetikony.com' })) }} />
      {/*
        Semantic SSR shell (ТЗ п.2 "SSR shell/fallback"): real server-rendered
        HTML for crawlers and no-JS clients. CalendarExperience below mounts
        a `position:fixed;inset:0;z-index:1001` full-viewport Cesium canvas
        client-side only (`ssr:false`) -- see calendar-globe.module.css's
        .experience -- which visually covers this section once it mounts,
        so nothing needs to be hidden here; the homepage is simply never an
        empty canvas for anyone who doesn't run the client bundle.
      */}
      <section id="home-intro">
        <h1>{copy.h1}</h1>
        <p>{copy.intro(hero.monthTitle)}</p>
        <nav aria-label={copy.h1}>
          <a href={`/${locale}/saints`}>{copy.links.saints}</a>
          <a href={`/${locale}/icons`}>{copy.links.icons}</a>
          <a href={`/${locale}/prayers`}>{copy.links.prayers}</a>
          <a href={`/${locale}/shop`}>{copy.links.shop}</a>
          <a href={`/${locale}/pravoslavna-istoriya`}>{copy.links.history}</a>
        </nav>
      </section>
      <CalendarExperience />
    </main>
  );
}
