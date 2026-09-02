import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockBuildContentPlanDayDetail = vi.fn();
vi.mock('@/lib/telegram/content-plan', () => ({ buildContentPlanDayDetail: mockBuildContentPlanDayDetail }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { GET } = await import('./route');

function req(token?: string) {
  return new Request('http://localhost/api/admin/telegram/content-plan/2026-09-02', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function ctx(date: string) {
  return { params: Promise.resolve({ date }) };
}

const SAMPLE_DAY = { civilDate: '2026-09-02', julianDate: '2026-08-20', calendarTitle: 'Пророк Самуїл', slots: {} };

describe('GET /api/admin/telegram/content-plan/:date', () => {
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without touching D1 (proves the drawer never fetches ahead of auth)', async () => {
    const response = await GET(req(), ctx('2026-09-02'));
    expect(response.status).toBe(401);
    expect(mockBuildContentPlanDayDetail).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await GET(req(weakToken), ctx('2026-09-02'));
    expect(response.status).toBe(403);
  });

  it('returns the single-day detail for a valid date', async () => {
    mockBuildContentPlanDayDetail.mockResolvedValue(SAMPLE_DAY);
    const response = await GET(req(token), ctx('2026-09-02'));
    expect(response.status).toBe(200);
    expect(mockBuildContentPlanDayDetail).toHaveBeenCalledWith('2026-09-02');
    expect(mockBuildContentPlanDayDetail).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(SAMPLE_DAY);
  });

  it('rejects a malformed date with 400 without calling the builder', async () => {
    const response = await GET(req(token), ctx('02-09-2026'));
    expect(response.status).toBe(400);
    expect(mockBuildContentPlanDayDetail).not.toHaveBeenCalled();
  });
});
