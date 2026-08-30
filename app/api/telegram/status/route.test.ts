import { describe, expect, it, vi } from 'vitest';
import type { TelegramConfig } from '@/lib/telegram/env';

let mockConfig: TelegramConfig | null = { botToken: 'fake-token', webhookSecret: 'secret', channel: '@svit_ikony' };

vi.mock('@/lib/telegram/env', () => ({
  getTelegramConfig: async () => mockConfig,
}));

const { GET } = await import('./route');

describe('GET /api/telegram/status', () => {
  it('reports configured: true with the channel when a token is set', async () => {
    mockConfig = { botToken: 'fake-token', webhookSecret: 'secret', channel: '@svit_ikony' };
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({ configured: true, channel: '@svit_ikony' });

    // Never leak the token or secret through this endpoint.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('fake-token');
    expect(raw).not.toContain('secret');
  });

  it('reports configured: false with a null channel when no token is set', async () => {
    mockConfig = null;
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({ configured: false, channel: null });
  });
});
