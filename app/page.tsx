import { CalendarView } from '@/components/site/CalendarView';
import { buildCalendarHero, calendarDayFromChurchPage, dedupeCalendarDaysByDay, prayerFromChurchDto } from '@/lib/api';
import { composeCalendarPages } from '@/lib/church-public/calendar-page';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { jsonLd } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';
import type { ChurchIconDto, ChurchPrayerDto, PublicChurchContentPage } from '@/lib/types';

export const revalidate = 0;

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

function mergeBySlug<T extends { slug: string }>(primary: T[], secondary: T[]) {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((item) => {
    if (seen.has(item.slug)) return false;
    seen.add(item.slug);
    return true;
  });
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ year?: string | string[]; month?: string | string[] }> }) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const year = normalizedYear(firstParam(params?.year));
  const month = normalizedMonth(firstParam(params?.month));
  const [allCalendarDays, allPrayers] = await Promise.all([
    listCalendarDays({ year, month }),
    listPrayers({ language: locale })
  ]);
  // Public homepage — draft days (and any draft icon/prayer/article/gospel
  // attached to a day) must never appear here; composeCalendarPages()
  // itself already filters related entities, but the day list it's given
  // has to be pre-filtered by the caller (see that function's own doc
  // comment for why the split is at this boundary).
  const calendarDays = allCalendarDays.filter((day) => day.status === 'published');
  const calendarPages = await composeCalendarPages(calendarDays, locale);
  const publicCalendarPages = calendarPages as unknown as PublicChurchContentPage[];
  const mapPrayer = (prayer: (typeof allPrayers)[number], icon?: (typeof calendarPages)[number]['icons'][number]) =>
    prayerFromChurchDto(prayer as unknown as ChurchPrayerDto, icon as unknown as ChurchIconDto | undefined);
  const calendarPrayers = calendarPages.flatMap((page) =>
    page.prayers.map((prayer) => mapPrayer(prayer, page.icons.find((icon) => icon.id === prayer.iconId) || page.icons[0]))
  );
  const prayers = mergeBySlug(
    calendarPrayers,
    allPrayers.filter((prayer) => prayer.status === 'published').map((prayer) => mapPrayer(prayer))
  );
  const calendar = {
    hero: buildCalendarHero(year, month),
    days: dedupeCalendarDaysByDay(publicCalendarPages.map(calendarDayFromChurchPage)),
    services: []
  };
  return (
    <main className="min-h-screen bg-canvas p-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Organization', { name: 'svetikony.com', url: 'https://svetikony.com' })) }} />
      <CalendarView icons={[]} prayers={prayers} pages={[]} calendar={calendar} />
    </main>
  );
}
