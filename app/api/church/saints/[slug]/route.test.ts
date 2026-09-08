import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchSaintDto } from '@/lib/types';

const mockListSaints = vi.hoisted(() => vi.fn());
const mockIsValidPreview = vi.hoisted(() => vi.fn());

vi.mock('@/lib/d1/repositories/saints', () => ({ listSaints: mockListSaints }));
vi.mock('@/lib/d1/repositories/icons', () => ({ listIcons: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/d1/repositories/prayers', () => ({ listPrayers: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/d1/repositories/calendarDays', () => ({ listCalendarDays: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/church-public/preview', () => ({ isValidPreview: mockIsValidPreview }));

async function importRoute() {
  return import('./route');
}

function saint(overrides: Partial<ChurchSaintDto> = {}): ChurchSaintDto {
  return {
    id: `id-${overrides.language ?? 'uk'}`,
    siteId: 'site-1',
    iconId: null,
    calendarDayId: null,
    slug: 'varvara',
    name: 'Свята Варвара',
    shortDescription: '',
    biography: 'Житіє',
    feastDayOldStyle: '',
    feastDayNewStyle: '',
    imageUrl: '',
    language: 'uk',
    translationGroupId: 'group-1',
    status: 'published',
    isGlobal: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function request(url: string) {
  return new NextRequest(url);
}

describe('GET /api/church/saints/:slug (PHASE MULTILINGUAL-1 / P0.1 + P0.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsValidPreview.mockResolvedValue(false);
  });

  it('unknown slug -> real 404 (bare null), not the translation-notice shape', async () => {
    mockListSaints.mockResolvedValue([]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/does-not-exist?language=uk'), { params: Promise.resolve({ slug: 'does-not-exist' }) });
    expect(await response.json()).toBeNull();
  });

  it('requested language (ru) has no row -> saint: null + translations list, never the uk row silently relabeled as ru', async () => {
    mockListSaints.mockResolvedValue([saint({ language: 'uk' })]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/varvara?language=ru'), { params: Promise.resolve({ slug: 'varvara' }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await response.json()) as any;
    expect(body.saint).toBeNull();
    expect(body.translations).toEqual([{ language: 'uk', slug: 'varvara', title: 'Свята Варвара' }]);
  });

  it('requested language (uk) matches -> returns the real uk row, translations lists the other published languages', async () => {
    mockListSaints.mockResolvedValue([
      saint({ language: 'uk', id: 'id-uk' }),
      saint({ language: 'ru', id: 'id-ru', name: 'Святая Варвара' })
    ]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/varvara?language=uk'), { params: Promise.resolve({ slug: 'varvara' }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await response.json()) as any;
    expect(body.saint.id).toBe('id-uk');
    expect(body.translations).toEqual([{ language: 'ru', slug: 'varvara', title: 'Святая Варвара' }]);
  });

  it('invalid language (pl) -> 400, upstream repository never even queried past the initial full list read', async () => {
    mockListSaints.mockResolvedValue([saint({ language: 'uk' })]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/varvara?language=pl'), { params: Promise.resolve({ slug: 'varvara' }) });
    expect(response.status).toBe(400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await response.json()) as any;
    expect(body.error).toBe('invalid_language');
  });

  it('absent language -> deterministic uk default, not whatever sorts first in the DB', async () => {
    mockListSaints.mockResolvedValue([
      saint({ language: 'ru', id: 'id-ru' }),
      saint({ language: 'uk', id: 'id-uk' })
    ]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/varvara'), { params: Promise.resolve({ slug: 'varvara' }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await response.json()) as any;
    expect(body.saint.id).toBe('id-uk');
  });

  it('requested language row exists but is a draft, not in preview -> treated as missing translation, not a silent draft leak', async () => {
    mockListSaints.mockResolvedValue([saint({ language: 'uk', status: 'published' }), saint({ language: 'ru', id: 'id-ru', status: 'draft' })]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/varvara?language=ru'), { params: Promise.resolve({ slug: 'varvara' }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await response.json()) as any;
    expect(body.saint).toBeNull();
  });

  it('preview mode surfaces the draft row for the requested language', async () => {
    mockIsValidPreview.mockResolvedValue(true);
    mockListSaints.mockResolvedValue([saint({ language: 'ru', id: 'id-ru', status: 'draft' })]);
    const { GET } = await importRoute();
    const response = await GET(request('http://localhost/api/church/saints/varvara?language=ru&preview_token=x'), { params: Promise.resolve({ slug: 'varvara' }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await response.json()) as any;
    expect(body.saint.id).toBe('id-ru');
  });
});
