import { composeCalendarPages } from '@/lib/church-public/calendar-page';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listSaints } from '@/lib/d1/repositories/saints';
import {
  formatGospel,
  formatPrayer,
  formatSaint,
  formatToday,
  NO_CONTENT_TODAY_TEXT,
  NO_GOSPEL_TEXT,
  NO_PRAYER_TEXT,
  NO_SAINT_TEXT,
} from './commands';

/** Church-domain lookups backing the bot's /today, /prayer, /saint, /gospel
 * commands — reuses the exact same D1 repository functions the site's own
 * `/api/church/*` routes call (see app/api/church/calendar/today/route.ts),
 * no separate query logic and no HTTP call back into this Worker's own API.
 * Mirrors assistant/src/interfaces/telegram/webhook.rs's fetch_*_text
 * functions. */

const LANGUAGE = 'uk';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function findTodayCalendarDay(): Promise<ChurchCalendarDayDto | null> {
  const days = await listCalendarDays({});
  const today = todayIso();
  return days.find((day) => day.dateNewStyle === today || day.dateOldStyle === today) ?? null;
}

export async function fetchTodayText(): Promise<string> {
  const day = await findTodayCalendarDay();
  if (!day) return NO_CONTENT_TODAY_TEXT;

  const [page] = await composeCalendarPages([day], LANGUAGE);
  const saints = await listSaints({ calendarDayId: day.id, language: LANGUAGE });
  return formatToday(page, saints);
}

export async function fetchPrayerText(): Promise<string> {
  const day = await findTodayCalendarDay();
  let prayers = day ? await listPrayers({ calendarDayId: day.id, language: LANGUAGE }) : [];
  if (prayers.length === 0) prayers = await listPrayers({ language: LANGUAGE });
  return prayers[0] ? formatPrayer(prayers[0]) : NO_PRAYER_TEXT;
}

export async function fetchSaintText(): Promise<string> {
  const day = await findTodayCalendarDay();
  let saints = day ? await listSaints({ calendarDayId: day.id, language: LANGUAGE }) : [];
  if (saints.length === 0) saints = await listSaints({ language: LANGUAGE });
  return saints[0] ? formatSaint(saints[0]) : NO_SAINT_TEXT;
}

export async function fetchGospelText(): Promise<string> {
  const day = await findTodayCalendarDay();
  let readings = day ? await listGospel({ calendarDayId: day.id, language: LANGUAGE }) : [];
  if (readings.length === 0) readings = await listGospel({ language: LANGUAGE });
  return readings[0] ? formatGospel(readings[0]) : NO_GOSPEL_TEXT;
}
