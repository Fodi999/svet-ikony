import type { Locale } from './i18n';

const LOCALE_CODES: Record<Locale, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US'
};

/** BCP-47 tag for Intl.* calls elsewhere that need locale-aware
 * formatting beyond what formatFeastDay covers (e.g. a month/year
 * calendar header). */
export function localeCode(locale: Locale): string {
  return LOCALE_CODES[locale];
}

/**
 * Formats a "MM-DD" feast-day string (year-agnostic, matches
 * church_saints.feast_day) into a locale-aware "4 грудня" / "4 декабря" /
 * "December 4" string. A fixed leap year (2024) is used as the calendar
 * anchor so Feb 29 entries still format instead of producing an Invalid
 * Date. Returns the raw input unchanged if it doesn't match the expected
 * shape (defensive — some rows may be empty or free-form).
 */
export function formatFeastDay(value: string | undefined, locale: Locale): string {
  if (!value) return '';
  const match = value.match(/^(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, month, day] = match;
  const date = new Date(Date.UTC(2024, Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(LOCALE_CODES[locale], { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

/** "MM-DD" for a given Date, in the visitor's local calendar day —
 * matches the shape church_saints.feast_day is stored in. */
export function monthDayFromDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
