import { AUTOPOST_CONTENT_TYPES, type AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';
import { loadAutopostFacts } from './autopost-content';
import { kyivDateIso } from './autopost';
import { getJulianCalendarDate } from './julian-calendar';

/**
 * Read-only preview report (task: "source availability coverage") --
 * before autonomous mode is enabled, this answers "will each of the 5
 * daily slots actually have real D1 data to publish from, for the next
 * week?" without ever calling OpenAI, Telegram, or writing anything. It
 * reuses loadAutopostFacts() -- the exact same lookup runAutopostTick()
 * itself performs -- so "available" here means the tick would truly find a
 * source, not an approximation of it. Never invents or fills in missing
 * data; a gap is reported as MISSING for a human to fix in D1, exactly as
 * the tick itself would skip that slot.
 */

export type SourceAvailability = 'available' | 'MISSING';

export type SourceCoverageRow = {
  /** Civil Europe/Kyiv date ('YYYY-MM-DD') -- what the admin UI/calendar
   * shows and what telegram_posts.publish_date would be. */
  civilDateIso: string;
  /** Orthodox Julian ('old style') date ('YYYY-MM-DD') actually looked up
   * in D1 -- see julian-calendar.ts. */
  julianDateIso: string;
  availability: Record<AutopostContentType, SourceAvailability>;
};

export type SourceCoverageReport = {
  generatedAt: string;
  rows: SourceCoverageRow[];
};

/**
 * `days` civil days starting from `from` (default: today, Europe/Kyiv).
 * Each day is offset by whole 24h steps in UTC and then re-rendered as an
 * Europe/Kyiv calendar date -- an approximation that could in principle
 * skip/repeat a day exactly at a DST transition, which is acceptable for a
 * human-facing preview report and not used anywhere the real tick's own
 * (always computed from the actual current instant) date logic runs.
 */
export async function buildSourceCoverageReport(days = 7, from: Date = new Date()): Promise<SourceCoverageReport> {
  const rows: SourceCoverageRow[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
    const civilDateIso = kyivDateIso(date);
    const julianDateIso = getJulianCalendarDate(date, 'Europe/Kyiv');

    const availability = {} as Record<AutopostContentType, SourceAvailability>;
    for (const contentType of AUTOPOST_CONTENT_TYPES) {
      const result = await loadAutopostFacts(contentType, julianDateIso);
      availability[contentType] = result.status === 'ok' ? 'available' : 'MISSING';
    }

    rows.push({ civilDateIso, julianDateIso, availability });
  }

  return { generatedAt: new Date().toISOString(), rows };
}
