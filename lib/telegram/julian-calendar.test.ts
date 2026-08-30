import { describe, expect, it } from 'vitest';
import { getJulianCalendarDate, gregorianToJulianCalendarDate } from './julian-calendar';

describe('gregorianToJulianCalendarDate', () => {
  it('converts 2026-08-30 to the old-style 2026-08-17 (13-day gap)', () => {
    expect(gregorianToJulianCalendarDate('2026-08-30')).toBe('2026-08-17');
  });

  it('converts 2000-01-01 to 1999-12-19, crossing a year boundary', () => {
    expect(gregorianToJulianCalendarDate('2000-01-01')).toBe('1999-12-19');
  });

  it('keeps the 13-day gap through the 2000 leap year (divisible by 400, leap in both calendars)', () => {
    expect(gregorianToJulianCalendarDate('2000-03-01')).toBe('2000-02-17');
  });

  it('resolves the Julian calendar\'s own Feb 29, 1900 correctly (a leap day Gregorian 1900 never had)', () => {
    // 1900 is a leap year under the plain "every 4th year" Julian rule but
    // not under Gregorian's /100-not-/400 exception, so the Julian
    // calendar gets a Feb 29 here that the Gregorian one skips entirely.
    expect(gregorianToJulianCalendarDate('1900-03-13')).toBe('1900-02-29');
  });

  it('widens the historical 12-day gap to 13 days starting 14 March 1900 (New Style) -- no hardcoded offset', () => {
    // Independently documented fact: the Russian Empire and other
    // Julian-calendar users of the era record the gap widening to 13 days
    // precisely on 14 March 1900 (Gregorian), immediately after the
    // Julian-only Feb 29 above -- this algorithm reproduces that date with
    // no century-boundary special-casing.
    expect(gregorianToJulianCalendarDate('1900-03-14')).toBe('1900-03-01');
  });

  it('repeats the same century-boundary pattern in 2100 with no code changes needed', () => {
    expect(gregorianToJulianCalendarDate('2100-03-14')).toBe('2100-02-29');
  });
});

describe('getJulianCalendarDate', () => {
  it('resolves the civil date in the given timezone before converting', () => {
    // 2026-08-30T21:30:00Z is already 2026-08-31 in Europe/Kyiv (UTC+3 in August).
    const civilDate = new Date('2026-08-30T21:30:00.000Z');
    expect(getJulianCalendarDate(civilDate, 'Europe/Kyiv')).toBe(gregorianToJulianCalendarDate('2026-08-31'));
  });

  it('matches the direct conversion for a plain UTC midday instant', () => {
    const civilDate = new Date('2026-08-30T12:00:00.000Z');
    expect(getJulianCalendarDate(civilDate, 'Europe/Kyiv')).toBe('2026-08-17');
  });

  it('is timezone-sensitive: the same instant can resolve to different Julian dates in different zones', () => {
    // 2026-08-30T22:30:00Z is 2026-08-31 in Kyiv (UTC+3) but still 2026-08-30 in New York (UTC-4).
    const civilDate = new Date('2026-08-30T22:30:00.000Z');
    expect(getJulianCalendarDate(civilDate, 'Europe/Kyiv')).toBe('2026-08-18');
    expect(getJulianCalendarDate(civilDate, 'America/New_York')).toBe('2026-08-17');
  });
});
