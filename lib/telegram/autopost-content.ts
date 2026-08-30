import { listArticles } from '@/lib/d1/repositories/articles';
import { listCalendarDays, type ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listSaints } from '@/lib/d1/repositories/saints';
import type { AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';

const LANGUAGE = 'uk';

export type AutopostFacts = {
  /** Plain-text facts handed to OpenAI verbatim — see lib/ai/openai.ts. */
  facts: string;
  sourceType: string;
  sourceId: string;
};

async function findCalendarDay(dateIso: string): Promise<ChurchCalendarDayDto | null> {
  const days = await listCalendarDays({});
  return days.find((day) => day.dateNewStyle === dateIso || day.dateOldStyle === dateIso) ?? null;
}

/**
 * Returns `null` whenever there isn't a real D1 row to ground a post in for
 * this content type on this date — callers (lib/telegram/autopost.ts) must
 * skip the slot entirely rather than ever calling OpenAI without facts.
 * `dateIso` is the Europe/Kyiv calendar date ('YYYY-MM-DD'), not UTC.
 */
export async function loadAutopostFacts(contentType: AutopostContentType, dateIso: string): Promise<AutopostFacts | null> {
  const calendarDay = await findCalendarDay(dateIso);
  if (!calendarDay) return null;

  const calendarLine = `Церковний календар: ${calendarDay.title}${calendarDay.description ? ` — ${calendarDay.description}` : ''}`;

  if (contentType === 'morning_prayer' || contentType === 'evening_prayer') {
    const prayerType = contentType === 'morning_prayer' ? 'morning' : 'evening';
    const prayers = await listPrayers({ calendarDayId: calendarDay.id, language: LANGUAGE });
    const prayer = prayers.find((p) => p.prayerType === prayerType);
    if (!prayer) return null;
    return {
      facts: `${calendarLine}\nМолитва «${prayer.title}»:\n${prayer.text}`,
      sourceType: 'prayer',
      sourceId: prayer.id,
    };
  }

  if (contentType === 'saint_of_day') {
    const saints = await listSaints({ calendarDayId: calendarDay.id, language: LANGUAGE });
    const saint = saints[0];
    if (!saint) return null;
    return {
      facts: `${calendarLine}\nСвятий дня: ${saint.name}\n${saint.shortDescription}${saint.biography ? `\n${saint.biography}` : ''}`,
      sourceType: 'saint',
      sourceId: saint.id,
    };
  }

  if (contentType === 'gospel') {
    const readings = await listGospel({ calendarDayId: calendarDay.id, language: LANGUAGE });
    const reading = readings[0];
    if (!reading) return null;
    return {
      facts: `${calendarLine}\nЄвангеліє дня: ${reading.title} (${reading.reference})\n${reading.text}${
        reading.explanation ? `\nПояснення: ${reading.explanation}` : ''
      }`,
      sourceType: 'gospel',
      sourceId: reading.id,
    };
  }

  // contentType === 'faith_story'
  const articles = await listArticles({ calendarDayId: calendarDay.id, language: LANGUAGE });
  const article = articles[0];
  if (!article) return null;
  return {
    facts: `${calendarLine}\nСтаття «${article.title}»:\n${article.content}`,
    sourceType: 'article',
    sourceId: article.id,
  };
}
