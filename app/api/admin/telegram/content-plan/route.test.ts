import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockBuildContentPlan = vi.fn();
vi.mock('@/lib/telegram/content-plan', () => ({ buildContentPlan: mockBuildContentPlan }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { GET } = await import('./route');

function req(query = '', token?: string) {
  return new Request(`http://localhost/api/admin/telegram/content-plan${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const SAMPLE_REPORT = { generatedAt: '2026-09-02T00:00:00.000Z', days: [], summary: {} };

describe('GET /api/admin/telegram/content-plan', () => {
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without touching D1', async () => {
    const response = await GET(req());
    expect(response.status).toBe(401);
    expect(mockBuildContentPlan).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await GET(req('', weakToken));
    expect(response.status).toBe(403);
  });

  it('defaults to the current Kyiv year when no params are given', async () => {
    mockBuildContentPlan.mockResolvedValue(SAMPLE_REPORT);
    const response = await GET(req('', token));
    expect(response.status).toBe(200);
    expect(mockBuildContentPlan).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-01-01$/), expect.stringMatching(/^\d{4}-12-31$/));
  });

  it('builds the full-year range from ?year=', async () => {
    mockBuildContentPlan.mockResolvedValue(SAMPLE_REPORT);
    const response = await GET(req('?year=2026', token));
    expect(response.status).toBe(200);
    expect(mockBuildContentPlan).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
  });

  it('forwards an explicit ?from=&to= range', async () => {
    mockBuildContentPlan.mockResolvedValue(SAMPLE_REPORT);
    const response = await GET(req('?from=2026-09-01&to=2026-09-30', token));
    expect(response.status).toBe(200);
    expect(mockBuildContentPlan).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
  });

  it('rejects an out-of-range year with 400', async () => {
    const response = await GET(req('?year=1800', token));
    expect(response.status).toBe(400);
    expect(mockBuildContentPlan).not.toHaveBeenCalled();
  });

  it('rejects from after to with 400', async () => {
    const response = await GET(req('?from=2026-09-30&to=2026-09-01', token));
    expect(response.status).toBe(400);
    expect(mockBuildContentPlan).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with 400', async () => {
    const response = await GET(req('?from=2026-9-1&to=2026-09-30', token));
    expect(response.status).toBe(400);
    expect(mockBuildContentPlan).not.toHaveBeenCalled();
  });

  it('rejects a range larger than the max with 400', async () => {
    const response = await GET(req('?from=2020-01-01&to=2026-12-31', token));
    expect(response.status).toBe(400);
    expect(mockBuildContentPlan).not.toHaveBeenCalled();
  });
});
