import type { ChurchVisualizerEventDto } from '@/lib/types';
import type { Locale } from '@/lib/i18n';

type EventDate = Pick<ChurchVisualizerEventDto, 'calendarEra' | 'yearStart' | 'yearEnd' | 'century' | 'displayDate' | 'sortYear'>;
const bc = { uk: 'до н. е.', ru: 'до н. э.', en: 'BC' };
const ad = { uk: 'н. е.', ru: 'н. э.', en: 'AD' };
export function centuryOf(event: EventDate): number | null {
  return event.century == null ? (event.yearStart == null ? null : Math.ceil(Math.abs(event.yearStart) / 100)) : Math.abs(event.century);
}
export function centuryKey(event: EventDate) {
  const century = centuryOf(event);
  return century === null ? 'undated' : `${event.calendarEra}:${century}`;
}
export function yearKey(event: EventDate) {
  return event.yearStart == null ? 'undated' : `${event.calendarEra}:${Math.abs(event.yearStart)}`;
}
export function chronologicalOrder(a: EventDate, b: EventDate) {
  const sort = (event: EventDate) => event.sortYear ?? (event.calendarEra === 'BC' ? -1 : 1) * (event.yearStart ?? (centuryOf(event) ?? 0) * 100);
  return sort(a) - sort(b);
}
function roman(number: number) {
  if (number < 1 || number > 50) return String(number);
  let result = '';
  for (const [value, text] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) {
    while (number >= value) { result += text; number -= value; }
  }
  return result;
}
export function centuryText(event: EventDate, locale: Locale) {
  const century = centuryOf(event);
  if (century === null) return { uk: 'Без точного століття', ru: 'Без точного века', en: 'Without an exact century' }[locale];
  return `${roman(century)} ${ { uk: 'століття', ru: 'век', en: 'century' }[locale]}${event.calendarEra === 'BC' ? ` ${bc[locale]}` : event.calendarEra === 'AD' ? ` ${ad[locale]}` : ''}`;
}
export function dateText(event: EventDate, locale: Locale, display = true) {
  if (display && event.displayDate) return event.displayDate;
  if (display && event.yearStart == null && centuryOf(event) !== null) return centuryText(event, locale);
  if (event.yearStart == null) return { uk: 'Без точного року', ru: 'Без точного года', en: 'Without an exact year' }[locale];
  const end = display && event.yearEnd != null && event.yearEnd !== event.yearStart ? `–${Math.abs(event.yearEnd)}` : '';
  return `${Math.abs(event.yearStart)}${end}${event.calendarEra === 'BC' ? ` ${bc[locale]}` : event.calendarEra === 'AD' ? ` ${ad[locale]}` : ''}`;
}
