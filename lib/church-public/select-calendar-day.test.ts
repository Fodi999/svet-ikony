import { describe, it, expect } from 'vitest';
import { selectCalendarDay } from './select-calendar-day';
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
