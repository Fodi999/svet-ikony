import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockAssignSlotAudio = vi.fn();
const mockRemoveSlotAudio = vi.fn();
vi.mock('@/lib/telegram/content-plan-actions', () => ({ assignSlotAudio: mockAssignSlotAudio, removeSlotAudio: mockRemoveSlotAudio }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { DELETE, PUT } = await import('./route');

function req(token?: string, body?: unknown, method: 'PUT' | 'DELETE' = 'PUT') {
  return new Request('http://localhost/api/admin/telegram/content-plan/2026-09-02/morning_prayer/audio', {
    method,
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

describe('PUT .../content-plan/:date/:type/audio', () => {
  let token: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without calling the action', async () => {
    const response = await PUT(req(undefined, { audioUrl: 'https://x/pick.mp3' }), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(401);
    expect(mockAssignSlotAudio).not.toHaveBeenCalled();
  });

  it('rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await PUT(req(weakToken, { audioUrl: 'https://x/pick.mp3' }), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(403);
  });

  it('rejects a malformed date with 400 without calling the action', async () => {
    const response = await PUT(req(token, { audioUrl: 'https://x/pick.mp3' }), ctx('02-09-2026', 'morning_prayer'));
    expect(response.status).toBe(400);
    expect(mockAssignSlotAudio).not.toHaveBeenCalled();
  });

  it('calls assignSlotAudio with the date/type and body and returns its result', async () => {
    mockAssignSlotAudio.mockResolvedValue({ id: 1, status: 'draft', audioUrl: 'https://x/pick.mp3' });
    const response = await PUT(req(token, { audioUrl: 'https://x/pick.mp3' }), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(200);
    expect(mockAssignSlotAudio).toHaveBeenCalledWith('2026-09-02', 'morning_prayer', 'https://x/pick.mp3');
    expect(await response.json()).toEqual({ id: 1, status: 'draft', audioUrl: 'https://x/pick.mp3' });
  });

  it('propagates an error from the action as an error response, never a 200 (e.g. an oversized/wrong-format asset)', async () => {
    const { ApiError } = await import('@/lib/d1/errors');
    mockAssignSlotAudio.mockRejectedValue(ApiError.validation('Unsupported audio format for Telegram: audio/ogg -- use MP3 or M4A'));
    const response = await PUT(req(token, { audioUrl: 'https://x/pick.ogg' }), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(400);
  });
});

describe('DELETE .../content-plan/:date/:type/audio', () => {
  let token: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('rejects an unauthenticated request with 401 without calling the action', async () => {
    const response = await DELETE(req(undefined, undefined, 'DELETE'), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(401);
    expect(mockRemoveSlotAudio).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with 400 without calling the action', async () => {
    const response = await DELETE(req(token, undefined, 'DELETE'), ctx('02-09-2026', 'morning_prayer'));
    expect(response.status).toBe(400);
    expect(mockRemoveSlotAudio).not.toHaveBeenCalled();
  });

  it('calls removeSlotAudio with the date/type and returns its result', async () => {
    mockRemoveSlotAudio.mockResolvedValue({ id: 1, status: 'draft', audioUrl: null });
    const response = await DELETE(req(token, undefined, 'DELETE'), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(200);
    expect(mockRemoveSlotAudio).toHaveBeenCalledWith('2026-09-02', 'morning_prayer');
    expect(await response.json()).toEqual({ id: 1, status: 'draft', audioUrl: null });
  });

  it('propagates an error from the action as an error response, never a 200', async () => {
    const { ApiError } = await import('@/lib/d1/errors');
    mockRemoveSlotAudio.mockRejectedValue(ApiError.conflict('already sent'));
    const response = await DELETE(req(token, undefined, 'DELETE'), ctx('2026-09-02', 'morning_prayer'));
    expect(response.status).toBe(409);
  });
});
