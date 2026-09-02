import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockAssignSlotImage = vi.fn();
vi.mock('@/lib/telegram/content-plan-actions', () => ({ assignSlotImage: mockAssignSlotImage }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { PUT } = await import('./route');

function req(token?: string, body?: unknown) {
  return new Request('http://localhost/api/admin/telegram/content-plan/2026-09-02/morning_prayer/image', {
    method: 'PUT',
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



describe('PUT .../content-plan/:date/:type/image', () => {
  let token: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without calling the action', async () => {
    const response = await PUT(req(undefined, {"mediaUrl": "https://x/pick.png"}), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(401);
    expect(mockAssignSlotImage).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await PUT(req(weakToken, {"mediaUrl": "https://x/pick.png"}), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(403);
  });

  it('rejects a malformed date with 400 without calling the action', async () => {
    const response = await PUT(req(token, {"mediaUrl": "https://x/pick.png"}), ctx('02-09-2026', 'morning_prayer'));
    expect(response.status).toBe(400);
    expect(mockAssignSlotImage).not.toHaveBeenCalled();
  });

  it('calls assignSlotImage with the date/type and body and returns its result', async () => {
    mockAssignSlotImage.mockResolvedValue({ id: 1, status: 'draft' });
    const response = await PUT(req(token, {"mediaUrl": "https://x/pick.png"}), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(200);
    expect(mockAssignSlotImage).toHaveBeenCalledWith('2026-09-02', 'morning_prayer', 'https://x/pick.png');
    expect(await response.json()).toEqual({ id: 1, status: 'draft' });
  });

  it('propagates an error from the action as an error response, never a 200', async () => {
    const { ApiError } = await import('@/lib/d1/errors');
    mockAssignSlotImage.mockRejectedValue(ApiError.conflict('already sent'));
    const response = await PUT(req(token, {"mediaUrl": "https://x/pick.png"}), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(409);
  });
});
