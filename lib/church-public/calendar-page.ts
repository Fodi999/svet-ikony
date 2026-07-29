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
 */
export async function composeCalendarPages(days: ChurchCalendarDayDto[], language?: string): Promise<PublicChurchContentPage[]> {
  const [icons, prayers, articles, gospel] = await Promise.all([
    listIcons({ language }),
    listPrayers({ language }),
    listArticles({ language }),
    listGospel({ language }),
  ]);

  const byDay = <T extends { calendarDayId?: string | null }>(items: T[], dayId: string) =>
    items.filter((item) => item.calendarDayId === dayId);

  return days.map((calendarDay) => ({
    calendarDay,
    icons: byDay(icons, calendarDay.id),
    prayers: byDay(prayers, calendarDay.id),
    articles: byDay(articles, calendarDay.id),
    gospel: byDay(gospel, calendarDay.id),
  }));
}
