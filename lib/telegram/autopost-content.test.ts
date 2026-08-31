import { describe, expect, it, vi } from 'vitest';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';

const mockListCalendarDays = vi.fn();
vi.mock('@/lib/d1/repositories/calendarDays', () => ({ listCalendarDays: mockListCalendarDays }));

const mockListSaints = vi.fn();
vi.mock('@/lib/d1/repositories/saints', () => ({ listSaints: mockListSaints }));

const mockListPrayers = vi.fn();
vi.mock('@/lib/d1/repositories/prayers', () => ({ listPrayers: mockListPrayers }));

const mockListGospel = vi.fn();
vi.mock('@/lib/d1/repositories/gospel', () => ({ listGospel: mockListGospel }));

const mockListArticles = vi.fn();
vi.mock('@/lib/d1/repositories/articles', () => ({ listArticles: mockListArticles }));

const { loadAutopostFacts } = await import('./autopost-content');

const JULIAN_DATE_ISO = '2026-08-17';
const CIVIL_DATE_ISO = '2026-08-30'; // what date_new_style would hold for the same feast -- must never be matched by autopost

function calendarDay(overrides: Partial<ChurchCalendarDayDto> = {}): ChurchCalendarDayDto {
  return {
    id: 'day-1',
    siteId: 'site',
    dateOldStyle: JULIAN_DATE_ISO,
    dateNewStyle: CIVIL_DATE_ISO,
    calendarType: 'both',
    title: 'Святитель Олександр Константинопольський',
    slug: 'test',
    language: 'uk',
    translationGroupId: 'group',
    dayType: 'saint',
    description: 'Опис',
    history: '',
    imageUrl: '',
    rank: 0,
    status: 'published',
    isGlobal: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('loadAutopostFacts', () => {
  it('returns missing_source when no calendar day matches the Julian date, without calling any content repo', async () => {
    mockListCalendarDays.mockResolvedValue([]);

    const result = await loadAutopostFacts('saint_of_day', JULIAN_DATE_ISO);

    expect(result).toEqual({ status: 'missing_source' });
    expect(mockListSaints).not.toHaveBeenCalled();
  });

  it('matches church_calendar_days by date_old_style, never by date_new_style', async () => {
    // A day whose date_new_style equals the civil date but whose
    // date_old_style is something else entirely must NOT be picked up when
    // looking up by the Julian date -- proves new-style is never a fallback.
    mockListCalendarDays.mockResolvedValue([calendarDay({ dateOldStyle: '2026-01-01', dateNewStyle: CIVIL_DATE_ISO })]);

    const result = await loadAutopostFacts('saint_of_day', JULIAN_DATE_ISO);

    expect(result).toEqual({ status: 'missing_source' });
  });

  it('does not match a calendar day whose date_old_style happens to equal the civil (new-style) date value', async () => {
    // Guards against accidentally comparing julianDateIso against
    // date_new_style by construction of the test fixture, not just intent.
    mockListCalendarDays.mockResolvedValue([calendarDay({ dateOldStyle: CIVIL_DATE_ISO, dateNewStyle: JULIAN_DATE_ISO })]);

    const result = await loadAutopostFacts('saint_of_day', JULIAN_DATE_ISO);

    expect(result).toEqual({ status: 'missing_source' });
  });

  it('finds the day by date_old_style and returns insufficient_data when saint_of_day has no matching Ukrainian saint', async () => {
    mockListCalendarDays.mockResolvedValue([calendarDay()]);
    mockListSaints.mockResolvedValue([]);

    const result = await loadAutopostFacts('saint_of_day', JULIAN_DATE_ISO);

    expect(mockListSaints).toHaveBeenCalledWith({ calendarDayId: 'day-1', language: 'uk' });
    expect(result).toEqual({ status: 'insufficient_data' });
  });

  it('returns real saint facts in Ukrainian for saint_of_day', async () => {
    mockListCalendarDays.mockResolvedValue([calendarDay()]);
    mockListSaints.mockResolvedValue([
      { id: 'saint-1', name: 'Святитель Олександр', shortDescription: 'Короткий опис', biography: 'Біографія' },
    ]);

    const result = await loadAutopostFacts('saint_of_day', JULIAN_DATE_ISO);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.facts.sourceType).toBe('saint');
    expect(result.facts.sourceId).toBe('saint-1');
    expect(result.facts.facts).toContain('Святитель Олександр');
    expect(result.facts.facts).toContain('старий стиль');
    // candidateName is what orthodox-calendar-verifier.ts checks against
    // independent sources before OpenAI is ever called -- see autopost.ts.
    expect(result.facts.candidateName).toBe('Святитель Олександр');
  });

  it('requests the Ukrainian gospel reading for the matched calendar day', async () => {
    mockListCalendarDays.mockResolvedValue([calendarDay()]);
    mockListGospel.mockResolvedValue([{ id: 'gospel-1', title: 'Заголовок', reference: 'Мт. 5:1-12', text: 'Текст', explanation: '' }]);

    const result = await loadAutopostFacts('gospel', JULIAN_DATE_ISO);

    expect(mockListGospel).toHaveBeenCalledWith({ calendarDayId: 'day-1', language: 'uk' });
    expect(result.status).toBe('ok');
  });

  it('requests Ukrainian prayers filtered by morning/evening prayer type', async () => {
    mockListCalendarDays.mockResolvedValue([calendarDay()]);
    mockListPrayers.mockResolvedValue([
      { id: 'prayer-morning', prayerType: 'morning', title: 'Ранкова', text: 'Текст ранкової' },
      { id: 'prayer-evening', prayerType: 'evening', title: 'Вечірня', text: 'Текст вечірньої' },
    ]);

    const morning = await loadAutopostFacts('morning_prayer', JULIAN_DATE_ISO);
    const evening = await loadAutopostFacts('evening_prayer', JULIAN_DATE_ISO);

    expect(mockListPrayers).toHaveBeenCalledWith({ calendarDayId: 'day-1', language: 'uk' });
    expect(morning.status).toBe('ok');
    expect(evening.status).toBe('ok');
    if (morning.status === 'ok') expect(morning.facts.sourceId).toBe('prayer-morning');
    if (evening.status === 'ok') expect(evening.facts.sourceId).toBe('prayer-evening');
  });

  it('requests the Ukrainian article for faith_story', async () => {
    mockListCalendarDays.mockResolvedValue([calendarDay()]);
    mockListArticles.mockResolvedValue([{ id: 'article-1', title: 'Стаття', content: 'Зміст' }]);

    const result = await loadAutopostFacts('faith_story', JULIAN_DATE_ISO);

    expect(mockListArticles).toHaveBeenCalledWith({ calendarDayId: 'day-1', language: 'uk' });
    expect(result.status).toBe('ok');
  });
});
