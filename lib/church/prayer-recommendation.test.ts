import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recommendPrayerForCalendarDay } from './prayer-recommendation';

vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: vi.fn(async () => ({ apiKey: 'PRIVATE_TEST_KEY', model: 'gpt-4o-mini' })) }));

const getCalendarDayMock = vi.fn();
vi.mock('@/lib/d1/repositories/calendarDays', () => ({ getCalendarDay: (id: string) => getCalendarDayMock(id) }));

const listPrayersMock = vi.fn();
vi.mock('@/lib/d1/repositories/prayers', () => ({ listPrayers: (params: unknown) => listPrayersMock(params) }));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  getCalendarDayMock.mockReset().mockResolvedValue({ id: 'day-1', title: 'Мучениця Софія', description: 'Пам’ять мучениці Софії', language: 'uk' });
  listPrayersMock.mockReset().mockResolvedValue([
    { id: 'prayer-1', title: 'Псалом 90', calendarDayId: undefined },
    { id: 'prayer-2', title: 'Молитва Оптинських старців', calendarDayId: undefined },
    { id: 'prayer-3', title: 'Вже зайнята іншим днем', calendarDayId: 'some-other-day' },
  ]);
});

function respondWith(prayerId: string) {
  fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: JSON.stringify({ prayerId }) } }] }));
}

describe('recommendPrayerForCalendarDay', () => {
  it('returns the id the model picks, when it is one of the supplied candidates', async () => {
    respondWith('prayer-2');
    const result = await recommendPrayerForCalendarDay('day-1');
    expect(result).toEqual({ prayerId: 'prayer-2' });
  });

  it('excludes prayers already linked to a different day from the candidate pool', async () => {
    respondWith('prayer-2');
    await recommendPrayerForCalendarDay('day-1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const candidateIds = body.messages[1].content && JSON.parse(body.messages[1].content).candidates.map((c: { id: string }) => c.id);
    expect(candidateIds).toEqual(['prayer-1', 'prayer-2']);
  });

  it('never sends full prayer text to the model -- only id and title', async () => {
    respondWith('prayer-1');
    await recommendPrayerForCalendarDay('day-1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const candidates = JSON.parse(body.messages[1].content).candidates;
    for (const candidate of candidates) expect(Object.keys(candidate).sort()).toEqual(['id', 'title']);
  });

  it('returns null when the model says "none"', async () => {
    respondWith('none');
    expect(await recommendPrayerForCalendarDay('day-1')).toEqual({ prayerId: null });
  });

  it('rejects an id the model invents that is not in the candidate list -- never trusts the model blindly', async () => {
    respondWith('prayer-does-not-exist');
    expect(await recommendPrayerForCalendarDay('day-1')).toEqual({ prayerId: null });
  });

  it('skips the AI call entirely when there are no unlinked candidates', async () => {
    listPrayersMock.mockResolvedValue([{ id: 'prayer-1', title: 'Псалом 90', calendarDayId: 'already-linked' }]);
    expect(await recommendPrayerForCalendarDay('day-1')).toEqual({ prayerId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the same low-effort model and JSON response format as the calendar text preparation', async () => {
    respondWith('prayer-1');
    await recommendPrayerForCalendarDay('day-1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-6-astra');
    expect(body.reasoning_effort).toBe('low');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});
