/**
 * Gregorian ('new style') <-> Orthodox Julian ('old style') calendar
 * conversion for the Telegram autopost calendar policy (see
 * autopost-content.ts). Deliberately NOT a hardcoded "-13 days": the
 * Julian/Gregorian gap widens by a day roughly every century (13 days for
 * 1900-03-01..2100-02-28, 14 days from 2100-03-01, ...), so this round-trips
 * through the Julian Day Number (an unambiguous, calendar-agnostic day
 * count) using the standard Fliegel & Van Flandern integer algorithm. That
 * makes century-boundary years correct for free, with no special-casing.
 */

/** Julian Day Number of a Gregorian calendar date. Calibrated so that
 * gregorianToJdn(2000, 1, 1) === 2451545, matching every reference table. */
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/** Inverse of gregorianToJdn, but for the proleptic JULIAN calendar --
 * deliberately omits the /100 and /400 leap-year correction terms, which
 * is the entire point: it recovers what a date "would be called" under the
 * calendar the Orthodox liturgical year still runs on. */
function jdnToJulianCalendar(jdn: number): { year: number; month: number; day: number } {
  const c = jdn + 32082;
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function parseIsoDate(dateIso: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateIso.split('-').map(Number);
  return { year, month, day };
}

/**
 * Converts a Gregorian ('new style') 'YYYY-MM-DD' date to its Orthodox
 * Julian ('old style') calendar equivalent, e.g. '2026-08-30' -> '2026-08-17'.
 * Pure function -- no timezone involved, both sides are plain calendar dates.
 */
export function gregorianToJulianCalendarDate(gregorianDateIso: string): string {
  const { year, month, day } = parseIsoDate(gregorianDateIso);
  const jdn = gregorianToJdn(year, month, day);
  const julian = jdnToJulianCalendar(jdn);
  return `${pad(julian.year, 4)}-${pad(julian.month, 2)}-${pad(julian.day, 2)}`;
}

/**
 * The Telegram autopost pipeline's one entry point for calendar policy:
 * "what is `civilDate` in `timeZone`, expressed in the Julian calendar
 * church_calendar_days.date_old_style uses?" Resolves the civil calendar
 * date in the given timezone first (Intl.DateTimeFormat, same approach as
 * kyivDateIso() in autopost.ts), then converts that Gregorian date.
 */
export function getJulianCalendarDate(civilDate: Date, timeZone: string): string {
  const gregorianIso = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(civilDate);
  return gregorianToJulianCalendarDate(gregorianIso);
}
