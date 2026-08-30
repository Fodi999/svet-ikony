import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockGetAutopostSettings = vi.fn();
const mockUpdateAutopostSettings = vi.fn();

vi.mock('@/lib/d1/repositories/telegram-autopost', () => ({
  getAutopostSettings: mockGetAutopostSettings,
  updateAutopostSettings: mockUpdateAutopostSettings,
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { GET, PUT } = await import('./route');

function req(method: string, token?: string, body?: unknown) {
  return new Request('http://localhost/api/admin/telegram/autopost/settings', {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const SAMPLE_SETTINGS = {
  globalEnabled: false,
  items: [{ contentType: 'morning_prayer', enabled: true, scheduleTime: '07:00' }],
};

describe('/api/admin/telegram/autopost/settings', () => {
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    token = await mintTestAdminJwt();
  });

  it('GET rejects an unauthenticated request with 401', async () => {
    const response = await GET(req('GET'));
    expect(response.status).toBe(401);
    expect(mockGetAutopostSettings).not.toHaveBeenCalled();
  });

  it('GET rejects a non-super_admin role with 403', async () => {
    const weakToken = await mintTestAdminJwt({ role: 'editor' });
    const response = await GET(req('GET', weakToken));
    expect(response.status).toBe(403);
  });

  it('GET returns the current settings for an authenticated super_admin', async () => {
    mockGetAutopostSettings.mockResolvedValue(SAMPLE_SETTINGS);
    const response = await GET(req('GET', token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SAMPLE_SETTINGS);
  });

  it('PUT rejects an unauthenticated request with 401 without touching the DB', async () => {
    const response = await PUT(req('PUT', undefined, { globalEnabled: true }));
    expect(response.status).toBe(401);
    expect(mockUpdateAutopostSettings).not.toHaveBeenCalled();
  });

  it('PUT forwards the payload and returns the updated settings', async () => {
    const payload = { globalEnabled: true, items: [{ contentType: 'morning_prayer', enabled: false }] };
    mockUpdateAutopostSettings.mockResolvedValue({ ...SAMPLE_SETTINGS, globalEnabled: true });

    const response = await PUT(req('PUT', token, payload));

    expect(response.status).toBe(200);
    expect(mockUpdateAutopostSettings).toHaveBeenCalledWith(payload);
    const body = (await response.json()) as { globalEnabled: boolean };
    expect(body.globalEnabled).toBe(true);
  });
});
