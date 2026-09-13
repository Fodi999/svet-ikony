import { beforeEach, expect, it, vi } from 'vitest';
import calendar from './data/orthodox-fixed-calendar.json';
import { prepareCalendarDate } from './calendar-date-preparation';
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: vi.fn(async () => ({ apiKey: 'PRIVATE_KEY', model: 'gpt-4o-mini' })) }));
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
it('bundles fixed-date source references for all 366 Julian month/day positions', () => {
  const days = calendar.days as Record<string, { sourceUrls: string[]; entries: { id: string; title: string }[] }>;
  expect(Object.keys(days)).toHaveLength(366);
  for (const [md, value] of Object.entries(days)) {
    expect(value.entries.length).toBeGreaterThan(0);
    expect(new Set(value.entries.map((entry) => entry.id)).size).toBe(value.entries.length);
    for (const year of [2024, 2020]) expect(value.sourceUrls).toContain(`https://www.oca.org/saints/lives/${year}/${md.replace('-', '/')}`);
    expect(value.entries.every((entry) => entry.title.trim().length > 0)).toBe(true);
  }
});
it('prepares October 1 even when all third-party calendar requests would be blocked', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url !== 'https://api.openai.com/v1/chat/completions') throw new Error('Calendar source unavailable from Worker');
    return Response.json({ choices: [{ message: { content: JSON.stringify({ title: 'Пам’яті дня', shortDescription: 'День вшанування святих.', history: 'Церква вшановує святих цього дня.', seoTitle: 'Церковний календар', seoDescription: 'Нерухомі пам’яті церковного календаря.' }) } }] });
  });
  const result = await prepareCalendarDate({ date: '2026-10-01', language: 'uk' });
  expect(result).toMatchObject({ date: '2026-10-01', dateOldStyle: '2026-09-18', status: 'draft' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.messages[1].content).toContain('Eumenius');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_KEY');
});
