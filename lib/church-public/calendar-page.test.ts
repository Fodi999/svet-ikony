import { describe, expect, it, vi } from 'vitest';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';

const mockListIcons = vi.fn(async () => []);
const mockListPrayers = vi.fn(async () => []);
const mockListArticles = vi.fn(async () => []);
const mockListGospel = vi.fn(async () => []);
vi.mock('@/lib/d1/repositories/icons', () => ({ listIcons: mockListIcons }));
vi.mock('@/lib/d1/repositories/prayers', () => ({ listPrayers: mockListPrayers }));
vi.mock('@/lib/d1/repositories/articles', () => ({ listArticles: mockListArticles }));
vi.mock('@/lib/d1/repositories/gospel', () => ({ listGospel: mockListGospel }));

const { composeCalendarPages } = await import('./calendar-page');

function day(overrides: Partial<ChurchCalendarDayDto> = {}): ChurchCalendarDayDto {
  return {
    id: 'day-1',
    siteId: 'svetikony',
    dateOldStyle: '2026-08-20',
    dateNewStyle: '2026-09-02',
    calendarType: 'both',
    title: 'Пророк Самуїл',
    slug: 'prophet-samuel',
    language: 'uk',
    translationGroupId: 'tg-1',
    dayType: 'saint',
    description: '',
    history: '',
    imageUrl: '',
    rank: 0,
    status: 'published',
    seoTitle: null,
    seoDescription: null,
    isGlobal: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * composeCalendarPages() previously had NO status filtering at all --
 * confirmed during the Content Plan Stage 3A architecture audit as a real
 * gap relative to every other public route (saints/prayers/gospel/
 * articles/icons all gate on `status !== 'published' && !preview`). These
 * tests lock in the fix: draft related content is invisible by default,
 * visible only in preview mode -- the calendar DAY's own status is the
 * caller's responsibility (see the routes/page that call this).
 */
describe('composeCalendarPages', () => {
  it('hides a draft icon/prayer/article/gospel by default (no preview)', async () => {
    mockListIcons.mockResolvedValue([{ id: 'icon-1', calendarDayId: 'day-1', status: 'draft' }] as never);
    mockListPrayers.mockResolvedValue([{ id: 'prayer-1', calendarDayId: 'day-1', status: 'draft' }] as never);
    mockListArticles.mockResolvedValue([{ id: 'article-1', calendarDayId: 'day-1', status: 'draft' }] as never);
    mockListGospel.mockResolvedValue([{ id: 'gospel-1', calendarDayId: 'day-1', status: 'draft' }] as never);

    const [page] = await composeCalendarPages([day()]);

    expect(page.icons).toHaveLength(0);
    expect(page.prayers).toHaveLength(0);
    expect(page.articles).toHaveLength(0);
    expect(page.gospel).toHaveLength(0);
  });

  it('shows a published icon/prayer/article/gospel by default', async () => {
    mockListIcons.mockResolvedValue([{ id: 'icon-1', calendarDayId: 'day-1', status: 'published' }] as never);
    mockListPrayers.mockResolvedValue([{ id: 'prayer-1', calendarDayId: 'day-1', status: 'published' }] as never);
    mockListArticles.mockResolvedValue([{ id: 'article-1', calendarDayId: 'day-1', status: 'published' }] as never);
    mockListGospel.mockResolvedValue([{ id: 'gospel-1', calendarDayId: 'day-1', status: 'published' }] as never);

    const [page] = await composeCalendarPages([day()]);

    expect(page.icons).toHaveLength(1);
    expect(page.prayers).toHaveLength(1);
    expect(page.articles).toHaveLength(1);
    expect(page.gospel).toHaveLength(1);
  });

  it('shows draft related content when options.preview is true', async () => {
    mockListIcons.mockResolvedValue([{ id: 'icon-1', calendarDayId: 'day-1', status: 'draft' }] as never);
    mockListPrayers.mockResolvedValue([]);
    mockListArticles.mockResolvedValue([]);
    mockListGospel.mockResolvedValue([]);

    const [page] = await composeCalendarPages([day()], undefined, { preview: true });

    expect(page.icons).toHaveLength(1);
  });

  it('still groups strictly by calendarDayId regardless of preview', async () => {
    mockListIcons.mockResolvedValue([
      { id: 'icon-1', calendarDayId: 'day-1', status: 'published' },
      { id: 'icon-2', calendarDayId: 'other-day', status: 'published' },
    ] as never);
    mockListPrayers.mockResolvedValue([]);
    mockListArticles.mockResolvedValue([]);
    mockListGospel.mockResolvedValue([]);

    const [page] = await composeCalendarPages([day({ id: 'day-1' })]);

    expect(page.icons.map((i) => i.id)).toEqual(['icon-1']);
  });
});
