import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDateInput, parseCalendarSource, prepareCalendarDate } from './calendar-date-preparation';
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: vi.fn(async () => ({ apiKey: 'PRIVATE_TEST_KEY', model: 'gpt-4o-mini' })) }));
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
const article = (date: string, id = '102653', title = 'Saint Eumenius') => `<article class="saint clearfix"><h2 class="name">${title}<!-- internal --></h2><p class="description">He served as bishop.</p><a href="/saints/lives/${date}/${id}-saint">Read</a></article>`;
function sources() {
  fetchMock.mockResolvedValueOnce(new Response(article('2024/09/18'), { headers: { 'Content-Type': 'text/html' } }));
  fetchMock.mockResolvedValueOnce(new Response(article('2020/09/18'), { headers: { 'Content-Type': 'text/html' } }));
}
const fields = { title: 'Святитель Євменій', shortDescription: 'Пам’ять святителя Євменія.', history: 'Святитель служив єпископом.', seoTitle: 'Святитель Євменій', seoDescription: 'Пам’ять святителя Євменія у церковному календарі.' };
describe('date-only calendar preparation', () => {
  it('computes October 1 as Julian September 18 without AI', () => {
    expect(parseDateInput({ date: '2026-10-01' }).julianDate).toBe('2026-09-18');
    expect(parseDateInput({ date: '2100-03-15' }).julianDate).toBe('2100-03-01');
  });
  it.each(['2026-02-30', 'not-a-date', '1899-01-01', '2200-01-01'])('rejects invalid date %s before any request', async (date) => {
    await expect(prepareCalendarDate({ date })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('ignores links outside the exact day and strips markup', () => {
    expect(parseCalendarSource(article('2024/09/18') + article('2024/09/19', '999'), '2024-09-18')).toEqual([{ id: '102653', title: 'Saint Eumenius', summary: 'He served as bishop.' }]);
  });
  it('returns only draft values with immutable dates and grounded prompts', async () => {
    sources();
    fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: JSON.stringify({ ...fields, status: 'published', date: '2000-01-01' }) } }] }));
    const result = await prepareCalendarDate({ date: '2026-10-01' });
    expect(result).toMatchObject({ ...fields, status: 'draft', date: '2026-10-01', dateOldStyle: '2026-09-18' });
    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.messages[0].content).toContain('Do not invent');
    expect(body.messages[1].content).toContain('Saint Eumenius');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TEST_KEY');
  });
  it('stops when source unavailable, without invoking AI', async () => {
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(prepareCalendarDate({ date: '2026-10-01' })).rejects.toMatchObject({ details: expect.stringContaining('Календарне джерело недоступне') });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not treat year-specific movable entries as fixed commemorations', async () => {
    fetchMock.mockResolvedValueOnce(new Response(article('2024/09/18', '111'), { headers: { 'Content-Type': 'text/html' } }));
    fetchMock.mockResolvedValueOnce(new Response(article('2020/09/18', '222'), { headers: { 'Content-Type': 'text/html' } }));
    await expect(prepareCalendarDate({ date: '2026-10-01' })).rejects.toMatchObject({ details: expect.stringContaining('Не вдалося визначити') });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sanitizes model errors instead of logging response credentials', async () => {
    sources(); fetchMock.mockResolvedValueOnce(new Response('PRIVATE_TEST_KEY', { status: 401 }));
    const log = vi.spyOn(console, 'error');
    await expect(prepareCalendarDate({ date: '2026-10-01' })).rejects.toMatchObject({ details: expect.stringContaining('AI не завершив') });
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
  it('rejects mixed-language output', async () => {
    sources(); fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: JSON.stringify(fields) } }] }));
    await expect(prepareCalendarDate({ date: '2026-10-01', language: 'en' })).rejects.toMatchObject({ details: expect.stringContaining('некоректний текст') });
  });
});
