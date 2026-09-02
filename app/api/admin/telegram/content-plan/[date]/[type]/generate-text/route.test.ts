import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockGenerateSlotText = vi.fn();
vi.mock('@/lib/telegram/content-plan-actions', () => ({ generateSlotText: mockGenerateSlotText }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { POST } = await import('./route');

function req(token?: string) {
  return new Request('http://localhost/api/admin/telegram/content-plan/2026-09-02/morning_prayer/generate-text', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
function ctx(date: string, type: string) {
  return { params: Promise.resolve({ date, type }) };
}

describe('POST .../content-plan/:date/:type/generate-text', () => {
  let token: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without calling the action', async () => {
    const response = await POST(req(), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(401);
    expect(mockGenerateSlotText).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await POST(req(weakToken), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(403);
  });

  it('rejects a malformed date with 400 without calling the action', async () => {
    const response = await POST(req(token), ctx('02-09-2026', 'morning_prayer'));
    expect(response.status).toBe(400);
    expect(mockGenerateSlotText).not.toHaveBeenCalled();
  });

  it('calls generateSlotText with the date/type and returns its result', async () => {
    mockGenerateSlotText.mockResolvedValue({ id: 1, text: 'Текст' });
    const response = await POST(req(token), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(200);
    expect(mockGenerateSlotText).toHaveBeenCalledWith('2026-09-02', 'morning_prayer');
    expect(await response.json()).toEqual({ id: 1, text: 'Текст' });
  });

  it('propagates a validation rejection (e.g. MISSING_SOURCE) as an error response, never a 200', async () => {
    const { ApiError } = await import('@/lib/d1/errors');
    mockGenerateSlotText.mockRejectedValue(ApiError.validation('MISSING_SOURCE'));
    const response = await POST(req(token), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(400);
  });
});
