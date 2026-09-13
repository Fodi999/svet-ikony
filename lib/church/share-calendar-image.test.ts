import { beforeEach, expect, it, vi } from 'vitest';
import { shareCalendarImage } from './share-calendar-image';
const m = vi.hoisted(() => ({ get: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/d1/repositories/calendarDays', () => ({ getCalendarDay: m.get }));
vi.mock('@/lib/d1/db', () => ({ d1Run: m.run }));
const source = { id: 'uk', translationGroupId: 'group', dateNewStyle: '2026-10-01', imageUrl: '/media/shared.png', imageMetadata: { origin: 'ai_generated' }, updatedAt: 'version' };
const target = { id: 'ru', translationGroupId: 'group', dateNewStyle: '2026-10-01', imageUrl: '', status: 'draft' };
beforeEach(() => { vi.clearAllMocks(); m.get.mockImplementation(async (id) => id === 'uk' ? source : target); m.run.mockResolvedValue({ meta: { changes: 1 } }); });
it('copies one URL with AI provenance, using a draft-only conditional update', async () => {
  await shareCalendarImage('ru', 'uk');
  expect(m.run).toHaveBeenCalledWith(expect.stringContaining("status = 'draft'"), '/media/shared.png', JSON.stringify(source.imageMetadata), 'ru', 'group', '2026-10-01', 'uk', '/media/shared.png', 'version');
});
it('refuses published targets without writes', async () => {
  m.get.mockImplementation(async (id) => id === 'uk' ? source : { ...target, status: 'published' });
  await expect(shareCalendarImage('ru', 'uk')).rejects.toMatchObject({ status: 409 }); expect(m.run).not.toHaveBeenCalled();
});
it('refuses another translation group', async () => {
  m.get.mockImplementation(async (id) => id === 'uk' ? source : { ...target, translationGroupId: 'other' });
  await expect(shareCalendarImage('ru', 'uk')).rejects.toMatchObject({ status: 400 }); expect(m.run).not.toHaveBeenCalled();
});
it('does not overwrite an existing different image', async () => {
  m.get.mockImplementation(async (id) => id === 'uk' ? source : { ...target, imageUrl: '/media/manual.png' });
  await expect(shareCalendarImage('ru', 'uk')).rejects.toMatchObject({ status: 409 }); expect(m.run).not.toHaveBeenCalled();
});
it('stops if the target was published concurrently', async () => {
  m.run.mockResolvedValue({ meta: { changes: 0 } });
  await expect(shareCalendarImage('ru', 'uk')).rejects.toMatchObject({ status: 409 });
});
