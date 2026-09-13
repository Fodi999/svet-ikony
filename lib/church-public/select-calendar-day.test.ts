import { describe, it, expect } from 'vitest';
import { selectCalendarDay, selectCalendarDaysForLocale } from './select-calendar-day';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
const day = (patch: Partial<ChurchCalendarDayDto> = {}) => ({ id: 'source', language: 'uk', status: 'published', dateNewStyle: '2026-09-01', dateOldStyle: null, ...patch }) as ChurchCalendarDayDto;
describe('public calendar selection', () => {
  it('does not let a draft translation shadow the published source', () => {
    const source = day();
    expect(selectCalendarDay([day({ language: 'en', status: 'draft' }), source], '2026-09-01', 'en')).toBe(source);
  });
  it('prefers a published requested translation regardless of row order', () => {
    const en = day({ language: 'en' });
    expect(selectCalendarDay([day(), en], '2026-09-01', 'en')).toBe(en);
  });
  it('prioritizes civil dates over overlapping old-style dates', () => {
    const source = day();
    expect(selectCalendarDay([day({ dateNewStyle: '2026-09-14', dateOldStyle: '2026-09-01' }), source], '2026-09-01')).toBe(source);
  });
  it('returns null for drafts only or missing dates', () => {
    expect(selectCalendarDay([day({ status: 'draft' })], '2026-09-01')).toBeNull();
    expect(selectCalendarDay([day()], '2027-01-01')).toBeNull();
  });
  it('allows explicit preview and legacy date lookups', () => {
    const draft = day({ status: 'draft', dateOldStyle: '2026-08-19' });
    expect(selectCalendarDay([draft], '2026-08-19', 'uk', true)).toBe(draft);
  });
});

describe('public calendar list selection (month grid)', () => {
  it('picks the requested-language row for a date with several published translations, not the most complete one', () => {
    const uk = day({ id: 'uk', language: 'uk', imageUrl: '/rich.png' });
    const en = day({ id: 'en', language: 'en' });
    expect(selectCalendarDaysForLocale([uk, en], 'en')).toEqual([en]);
  });
  it('falls back to uk, then to whatever is published, when the requested language is missing', () => {
    const uk = day({ id: 'uk', language: 'uk' });
    const ru = day({ id: 'ru', language: 'ru', dateNewStyle: '2026-09-02' });
    expect(selectCalendarDaysForLocale([uk], 'en')).toEqual([uk]);
    expect(selectCalendarDaysForLocale([ru], 'en')).toEqual([ru]);
  });
  it('never lets a draft translation win a date over a published one', () => {
    const source = day();
    const draftEn = day({ id: 'draft-en', language: 'en', status: 'draft' });
    expect(selectCalendarDaysForLocale([draftEn, source], 'en')).toEqual([source]);
  });
  it('returns exactly one row per distinct date', () => {
    const sep1uk = day({ id: 'sep1-uk' });
    const sep1en = day({ id: 'sep1-en', language: 'en' });
    const sep2uk = day({ id: 'sep2-uk', dateNewStyle: '2026-09-02' });
    const result = selectCalendarDaysForLocale([sep1uk, sep1en, sep2uk], 'uk');
    expect(result.map((item) => item.id).sort()).toEqual(['sep1-uk', 'sep2-uk']);
  });
  it('passes through rows with no date at all instead of dropping them', () => {
    const undated = day({ id: 'undated', dateNewStyle: null, dateOldStyle: null });
    expect(selectCalendarDaysForLocale([undated], 'uk')).toEqual([undated]);
  });
});
