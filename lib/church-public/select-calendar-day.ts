import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';

/** Public dates prefer the civil date, then a legacy old-style match.
 * Unpublished translations must never shadow a published source.
 */
export function selectCalendarDay(days: ChurchCalendarDayDto[], date: string, language = 'uk', preview = false) {
  const visible = days.filter(day => preview || day.status === 'published');
  const civil = visible.filter(day => day.dateNewStyle === date);
  const candidates = civil.length ? civil : visible.filter(day => day.dateOldStyle === date);
  return candidates.find(day => day.language === language)
    ?? candidates.find(day => day.language === 'uk')
    ?? candidates[0]
    ?? null;
}

/** List views (the month grid) span many dates at once, so this applies
 * selectCalendarDay()'s exact same per-date precedence -- requested
 * language, then uk, then whatever's published -- across every distinct
 * date in `days`, returning one row per date. Without this, a date with
 * more than one published translation was picked by content completeness
 * alone (see dedupeCalendarDaysByDay's score), ignoring the page's own
 * locale entirely. Rows with neither date field pass through unchanged
 * (nothing to key them by). */
export function selectCalendarDaysForLocale(days: ChurchCalendarDayDto[], language = 'uk'): ChurchCalendarDayDto[] {
  const visible = days.filter(day => day.status === 'published');
  const byDate = new Map<string, ChurchCalendarDayDto[]>();
  const undated: ChurchCalendarDayDto[] = [];
  for (const day of visible) {
    const key = day.dateNewStyle || day.dateOldStyle;
    if (!key) { undated.push(day); continue; }
    const bucket = byDate.get(key);
    if (bucket) bucket.push(day); else byDate.set(key, [day]);
  }
  const chosen = [...byDate.values()].map(candidates =>
    candidates.find(day => day.language === language) ?? candidates.find(day => day.language === 'uk') ?? candidates[0]
  );
  return [...chosen, ...undated];
}
