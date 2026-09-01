import { listArticles } from '@/lib/d1/repositories/articles';
import { listCalendarDays, type ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listSaints } from '@/lib/d1/repositories/saints';
import type { AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';

/** Telegram autopost is Julian-calendar-only (Orthodox "old style") --
 * every lookup below is keyed by church_calendar_days.date_old_style, never
 * date_new_style. See lib/telegram/julian-calendar.ts for how the caller
 * (autopost.ts) turns "today in Europe/Kyiv" into the julianDateIso passed
 * in here, so the two calendars never get mixed by accident. */
const LANGUAGE = 'uk';

export type AutopostFacts = {
  /** Plain-text facts handed to OpenAI verbatim — see lib/ai/openai.ts. */
  facts: string;
  sourceType: string;
  sourceId: string;
  /** The D1 saint's own name/title (church_saints.name) -- set only for
   * saint_of_day, where it's the "candidate" checked against independent
   * sources by lib/telegram/orthodox-calendar-verifier.ts before OpenAI is
   * ever called. Undefined for every other content type. */
  candidateName?: string;
  /** church_saints.imageUrl, when the row has one -- a real, admin-curated
   * media asset for this specific saint. Set only for saint_of_day. When
   * present, ensureAutopostImage() (autopost-image.ts) uses this directly
   * instead of ever generating an AI image, so a genuine icon/photo is
   * always preferred over a generic AI scene next to the saint's name. */
  verifiedImageUrl?: string;
};

export type AutopostFactsResult =
  | { status: 'ok'; facts: AutopostFacts }
  /** No church_calendar_days row at all for this Julian date -- the
   * autopost pipeline must skip (skipped_missing_source), never call
   * OpenAI, and never fall back to date_new_style. */
  | { status: 'missing_source' }
  /** The calendar day exists, but this content type's own table (prayers/
   * saints/gospel/articles) has no matching Ukrainian row for it. */
  | { status: 'insufficient_data' };

/**
 * Looks up the calendar day for `julianDateIso` by date_old_style ONLY.
 * date_new_style is deliberately never consulted here -- that field is the
 * public site's Gregorian display date and mixing the two would produce a
 * post grounded in the wrong saint/reading for the day it claims to be.
 */
async function findCalendarDayByOldStyle(julianDateIso: string): Promise<ChurchCalendarDayDto | null> {
  const days = await listCalendarDays({});
  return days.find((day) => day.dateOldStyle === julianDateIso) ?? null;
}

/**
 * `julianDateIso` is the Orthodox Julian ('old style') calendar date for
 * the slot being considered, already converted from Europe/Kyiv's civil
 * date by the caller (see lib/telegram/julian-calendar.ts). Never returns
 * fabricated facts: 'missing_source' and 'insufficient_data' both mean
 * callers (lib/telegram/autopost.ts) must skip the slot without ever
 * calling OpenAI.
 */
export async function loadAutopostFacts(contentType: AutopostContentType, julianDateIso: string): Promise<AutopostFactsResult> {
  const calendarDay = await findCalendarDayByOldStyle(julianDateIso);
  if (!calendarDay) return { status: 'missing_source' };

  const calendarLine = `Церковний календар (старий стиль): ${calendarDay.title}${calendarDay.description ? ` — ${calendarDay.description}` : ''}`;

  if (contentType === 'morning_prayer' || contentType === 'evening_prayer') {
    const prayerType = contentType === 'morning_prayer' ? 'morning' : 'evening';
    const prayers = await listPrayers({ calendarDayId: calendarDay.id, language: LANGUAGE });
    const prayer = prayers.find((p) => p.prayerType === prayerType);
    if (!prayer) return { status: 'insufficient_data' };
    return {
      status: 'ok',
      facts: { facts: `${calendarLine}\nМолитва «${prayer.title}»:\n${prayer.text}`, sourceType: 'prayer', sourceId: prayer.id },
    };
  }

  if (contentType === 'saint_of_day') {
    const saints = await listSaints({ calendarDayId: calendarDay.id, language: LANGUAGE });
    const saint = saints[0];
    if (!saint) return { status: 'insufficient_data' };
    return {
      status: 'ok',
      facts: {
        facts: `${calendarLine}\nСвятий дня: ${saint.name}\n${saint.shortDescription}${saint.biography ? `\n${saint.biography}` : ''}`,
        sourceType: 'saint',
        sourceId: saint.id,
        candidateName: saint.name,
        verifiedImageUrl: saint.imageUrl?.trim() || undefined,
      },
    };
  }

  if (contentType === 'gospel') {
    const readings = await listGospel({ calendarDayId: calendarDay.id, language: LANGUAGE });
    const reading = readings[0];
    if (!reading) return { status: 'insufficient_data' };
    return {
      status: 'ok',
      facts: {
        facts: `${calendarLine}\nЄвангеліє дня: ${reading.title} (${reading.reference})\n${reading.text}${
          reading.explanation ? `\nПояснення: ${reading.explanation}` : ''
        }`,
        sourceType: 'gospel',
        sourceId: reading.id,
      },
    };
  }

  // contentType === 'faith_story'
  const articles = await listArticles({ calendarDayId: calendarDay.id, language: LANGUAGE });
  const article = articles[0];
  if (!article) return { status: 'insufficient_data' };
  return {
    status: 'ok',
    facts: { facts: `${calendarLine}\nСтаття «${article.title}»:\n${article.content}`, sourceType: 'article', sourceId: article.id },
  };
}
