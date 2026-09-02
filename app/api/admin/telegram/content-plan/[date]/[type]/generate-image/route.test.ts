import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockGenerateSlotImage = vi.fn();
vi.mock('@/lib/telegram/content-plan-actions', () => ({ generateSlotImage: mockGenerateSlotImage }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { POST } = await import('./route');

function req(token?: string, body?: unknown) {
  return new Request('http://localhost/api/admin/telegram/content-plan/2026-09-02/morning_prayer/generate-image', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
function ctx(date: string, type: string) {
  return { params: Promise.resolve({ date, type }) };
}



describe('POST .../content-plan/:date/:type/generate-image', () => {
  let token: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without calling the action', async () => {
    const response = await POST(req(undefined, undefined), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(401);
    expect(mockGenerateSlotImage).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await POST(req(weakToken, undefined), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(403);
  });

  it('rejects a malformed date with 400 without calling the action', async () => {
    const response = await POST(req(token, undefined), ctx('02-09-2026', 'morning_prayer'));
    expect(response.status).toBe(400);
    expect(mockGenerateSlotImage).not.toHaveBeenCalled();
  });

  it('calls generateSlotImage with the date/type and returns its result', async () => {
    mockGenerateSlotImage.mockResolvedValue({ id: 1, status: 'draft' });
    const response = await POST(req(token, undefined), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(200);
    expect(mockGenerateSlotImage).toHaveBeenCalledWith('2026-09-02', 'morning_prayer');
    expect(await response.json()).toEqual({ id: 1, status: 'draft' });
  });

  it('propagates an error from the action as an error response, never a 200', async () => {
    const { ApiError } = await import('@/lib/d1/errors');
    mockGenerateSlotImage.mockRejectedValue(ApiError.conflict('already sent'));
    const response = await POST(req(token, undefined), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(409);
  });
});
