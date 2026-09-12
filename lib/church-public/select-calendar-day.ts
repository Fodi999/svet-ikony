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
