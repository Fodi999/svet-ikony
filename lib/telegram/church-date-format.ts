/**
 * Single place that turns a civil (Gregorian/new-style) ISO date and a
 * Julian (Orthodox/old-style) ISO date into the Ukrainian phrases every
 * autopost content type must use whenever it mentions "today's" church
 * date. Pulled out so prompt builders (lib/ai/openai.ts) and the facts
 * builder (autopost-content.ts) share one formatting, instead of each
 * re-deriving its own -- the bug this fixes ("Сьогодні, 21 серпня за
 * юліанським календарем...", civil date missing entirely) was exactly
 * that kind of drift.
 *
 * Does NOT compute either date -- both are handed in as already-resolved,
 * verified ISO strings (see lib/telegram/julian-calendar.ts for the
 * Julian conversion, which this module never touches). Uses
 * Intl.DateTimeFormat('uk-UA', { month: 'long' }) for the genitive month
 * form ("3 вересня", not "Вересень 3") -- the same technique lib/dates.ts's
 * formatFeastDay already relies on elsewhere in this codebase, rather than
 * a second hand-written month-name table that could drift out of sync.
 */

const UA_LOCALE = 'uk-UA';

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** '2026-09-03' -> '3 вересня' (day + genitive month, no year -- matches
 * the compact form used throughout this channel's existing copy). */
export function formatChurchDateProse(dateIso: string): string {
  const date = parseIsoDate(dateIso);
  return new Intl.DateTimeFormat(UA_LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

/**
 * Both dates as one natural sentence fragment, e.g.
 * "3 вересня — 21 серпня за юліанським календарем" -- for insertion into
 * generated prose (morning_prayer/evening_prayer/gospel/faith_story, and
 * saint_of_day's own body) wherever "today" needs stating. `civilDateIso`
 * is the Europe/Kyiv publish date; `julianDateIso` is the church's own
 * old-style date the facts are grounded in (never the other way round).
 */
export function formatChurchDatesProse(civilDateIso: string, julianDateIso: string): string {
  return `${formatChurchDateProse(civilDateIso)} — ${formatChurchDateProse(julianDateIso)} за юліанським календарем`;
}

/**
 * Canonical heading form, e.g.
 * "3 вересня (21 серпня за юліанським календарем)" -- for saint_of_day's
 * title line, which states both dates up front before naming who the day
 * commemorates (see content-format.ts's buildSaintOfDayTitle).
 */
export function formatChurchDatesHeading(civilDateIso: string, julianDateIso: string): string {
  return `${formatChurchDateProse(civilDateIso)} (${formatChurchDateProse(julianDateIso)} за юліанським календарем)`;
}
