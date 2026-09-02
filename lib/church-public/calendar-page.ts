import type { ChurchArticleDto } from '@/lib/d1/repositories/articles';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import type { ChurchGospelDto } from '@/lib/d1/repositories/gospel';
import type { ChurchIconDto } from '@/lib/d1/repositories/icons';
import type { ChurchPrayerDto } from '@/lib/d1/repositories/prayers';
import { listArticles } from '@/lib/d1/repositories/articles';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listPrayers } from '@/lib/d1/repositories/prayers';

export interface PublicChurchContentPage {
  calendarDay: ChurchCalendarDayDto;
  icons: ChurchIconDto[];
  prayers: ChurchPrayerDto[];
  articles: ChurchArticleDto[];
  gospel: ChurchGospelDto[];
}

/**
 * Fetches every icon/prayer/article/gospel once (these tables are small —
 * dozens to a few hundred rows) and groups them by `calendarDayId`, so
 * composing N calendar days (a whole month) doesn't do N+1 repository
 * calls. Mirrors `PublicChurchContentPage` from lib/types.ts exactly.
 *
 * `options.preview` gates draft-content visibility exactly like every
 * other public by-slug route already does (see e.g.
 * app/api/church/saints/[slug]/route.ts's `status !== 'published' && !preview`
 * check) -- previously this function had NO status filtering at all, so a
 * draft icon/prayer/article/gospel attached to any calendar day (published
 * or not) was fully visible on the public homepage and calendar-day page.
 * Callers are responsible for gating the calendar DAY itself the same way
 * (see the callers of this function) -- this only filters the related
 * entities it fetches itself.
 */
export async function composeCalendarPages(
  days: ChurchCalendarDayDto[],
  language?: string,
  options?: { preview?: boolean }
): Promise<PublicChurchContentPage[]> {
  const preview = options?.preview ?? false;
  const [icons, prayers, articles, gospel] = await Promise.all([
    listIcons({ language }),
    listPrayers({ language }),
    listArticles({ language }),
    listGospel({ language }),
  ]);

  const published = <T extends { status?: string }>(items: T[]) => (preview ? items : items.filter((item) => item.status === 'published'));
  const byDay = <T extends { calendarDayId?: string | null }>(items: T[], dayId: string) =>
    items.filter((item) => item.calendarDayId === dayId);

  const visibleIcons = published(icons);
  const visiblePrayers = published(prayers);
  const visibleArticles = published(articles);
  const visibleGospel = published(gospel);

  return days.map((calendarDay) => ({
    calendarDay,
    icons: byDay(visibleIcons, calendarDay.id),
    prayers: byDay(visiblePrayers, calendarDay.id),
    articles: byDay(visibleArticles, calendarDay.id),
    gospel: byDay(visibleGospel, calendarDay.id),
  }));
}
