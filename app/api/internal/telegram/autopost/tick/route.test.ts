import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunAutopostTick = vi.fn();
vi.mock('@/lib/telegram/autopost', () => ({ runAutopostTick: mockRunAutopostTick }));

let mockSecret: string | null = 'shared-secret';
vi.mock('@/lib/telegram/env', () => ({ getAutopostTickSecret: async () => mockSecret }));

const { POST } = await import('./route');

function tickRequest(secretHeader?: string) {
  return new Request('http://localhost/api/internal/telegram/autopost/tick', {
    method: 'POST',
    headers: secretHeader !== undefined ? { 'X-Autopost-Secret': secretHeader } : {},
  });
}

describe('POST /api/internal/telegram/autopost/tick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecret = 'shared-secret';
  });

  it('rejects a missing secret header with 401', async () => {
    const response = await POST(tickRequest());
    expect(response.status).toBe(401);
    expect(mockRunAutopostTick).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret with 401', async () => {
    const response = await POST(tickRequest('wrong'));
    expect(response.status).toBe(401);
    expect(mockRunAutopostTick).not.toHaveBeenCalled();
  });

  it('fails closed when AUTOPOST_TICK_SECRET is not configured at all', async () => {
    mockSecret = null;
    const response = await POST(tickRequest('anything'));
    expect(response.status).toBe(401);
  });

  it('runs the tick and returns its summary on a matching secret', async () => {
    mockRunAutopostTick.mockResolvedValue({ ranAt: '2026-08-30T04:00:00.000Z', globalEnabled: true, attempted: [] });

    const response = await POST(tickRequest('shared-secret'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ranAt: '2026-08-30T04:00:00.000Z', globalEnabled: true, attempted: [] });
    expect(mockRunAutopostTick).toHaveBeenCalledTimes(1);
  });
});
