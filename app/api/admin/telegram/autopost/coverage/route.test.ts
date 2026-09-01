import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockBuildSourceCoverageReport = vi.fn();
vi.mock('@/lib/telegram/source-coverage', () => ({ buildSourceCoverageReport: mockBuildSourceCoverageReport }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { GET } = await import('./route');

function req(query = '', token?: string) {
  return new Request(`http://localhost/api/admin/telegram/autopost/coverage${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const SAMPLE_REPORT = { generatedAt: '2026-08-30T00:00:00.000Z', rows: [] };

describe('GET /api/admin/telegram/autopost/coverage', () => {
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without touching D1', async () => {
    const response = await GET(req());
    expect(response.status).toBe(401);
    expect(mockBuildSourceCoverageReport).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await GET(req('', weakToken));
    expect(response.status).toBe(403);
  });

  it('defaults to a 7-day report when no ?days is given', async () => {
    mockBuildSourceCoverageReport.mockResolvedValue(SAMPLE_REPORT);
    const response = await GET(req('', token));
    expect(response.status).toBe(200);
    expect(mockBuildSourceCoverageReport).toHaveBeenCalledWith(7);
    expect(await response.json()).toEqual(SAMPLE_REPORT);
  });

  it('forwards a valid ?days= override', async () => {
    mockBuildSourceCoverageReport.mockResolvedValue(SAMPLE_REPORT);
    const response = await GET(req('?days=14', token));
    expect(response.status).toBe(200);
    expect(mockBuildSourceCoverageReport).toHaveBeenCalledWith(14);
  });

  it('rejects an out-of-range ?days= with 400 without calling the report builder', async () => {
    const response = await GET(req('?days=999', token));
    expect(response.status).toBe(400);
    expect(mockBuildSourceCoverageReport).not.toHaveBeenCalled();
  });

  it('rejects a non-integer ?days= with 400', async () => {
    const response = await GET(req('?days=abc', token));
    expect(response.status).toBe(400);
    expect(mockBuildSourceCoverageReport).not.toHaveBeenCalled();
  });
});
