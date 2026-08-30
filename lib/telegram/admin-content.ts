import { composeCalendarPages } from '@/lib/church-public/calendar-page';
import type { ChurchArticleDto } from '@/lib/d1/repositories/articles';
import { listArticles } from '@/lib/d1/repositories/articles';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import type { ChurchGospelDto } from '@/lib/d1/repositories/gospel';
import type { ChurchPrayerDto } from '@/lib/d1/repositories/prayers';
import type { ChurchSaintDto } from '@/lib/d1/repositories/saints';
import { listSaints } from '@/lib/d1/repositories/saints';

const LANGUAGE = 'uk';

export type TelegramTodayContent = {
  calendarDay: ChurchCalendarDayDto | null;
  saint: ChurchSaintDto | null;
  prayer: ChurchPrayerDto | null;
  gospel: ChurchGospelDto | null;
  article: ChurchArticleDto | null;
  imageUrl: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Admin "Сьогодні" tab — the same source data
 * `lib/telegram/content.ts`'s `fetchTodayText()` assembles for the bot's
 * `/today` command, returned as structured picks instead of pre-formatted
 * text so the composer can show/edit each piece (saint, prayer, gospel,
 * article, image) independently before publishing.
 */
export async function getTodayContentForAdmin(): Promise<TelegramTodayContent> {
  const days = await listCalendarDays({});
  const today = todayIso();
  const calendarDay = days.find((day) => day.dateNewStyle === today || day.dateOldStyle === today) ?? null;

  if (!calendarDay) {
    return { calendarDay: null, saint: null, prayer: null, gospel: null, article: null, imageUrl: null };
  }

  const [page] = await composeCalendarPages([calendarDay], LANGUAGE);
  const [saints, articles] = await Promise.all([
    listSaints({ calendarDayId: calendarDay.id, language: LANGUAGE }),
    listArticles({ calendarDayId: calendarDay.id, language: LANGUAGE }),
  ]);

  const icon = page.icons[0] ?? null;

  return {
    calendarDay,
    saint: saints[0] ?? null,
    prayer: page.prayers[0] ?? null,
    gospel: page.gospel[0] ?? null,
    article: articles[0] ?? null,
    imageUrl: icon?.imageUrl || calendarDay.imageUrl || null,
  };
}
