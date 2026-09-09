import { describe, expect, it } from 'vitest';
import { centuryKey, yearKey, dateText, centuryText, chronologicalOrder } from './chronology';
const event = (calendarEra = 'AD', yearStart: number | null = 988, yearEnd: number | null = null) => ({ calendarEra, yearStart, yearEnd, century: null, displayDate: '', sortYear: (calendarEra === 'BC' ? -1 : 1) * (yearStart ?? 0) });
describe('historical chronology', () => {
  it('keeps BC and AD groups distinct', () => {
    expect(centuryKey(event('BC', 33))).not.toBe(centuryKey(event('AD', 33)));
    expect(yearKey(event('BC', 33))).not.toBe(yearKey(event('AD', 33)));
  });
  it('sorts BC dates in chronological order', () => {
    expect([event('BC', 100), event('AD', 33), event('BC', 500)].sort(chronologicalOrder).map((item) => item.sortYear)).toEqual([-500, -100, 33]);
  });
  it('derives the century and formats a period', () => {
    expect(centuryText(event(), 'uk')).toBe('X століття н. е.');
    expect(dateText(event('BC', 500, 450), 'ru')).toBe('500–450 до н. э.');
  });
  it('preserves traditional dating and undated grouping', () => {
    expect(centuryKey(event('unknown', null))).toBe('undated');
    expect(dateText({ ...event('unknown', null), displayDate: 'Традиційна хронологія' }, 'uk')).toBe('Традиційна хронологія');
  });
});
