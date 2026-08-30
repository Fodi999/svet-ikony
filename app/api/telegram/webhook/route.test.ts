import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramConfig } from '@/lib/telegram/env';

/** Integration-ish test for the real Next.js route handler (no live D1, no
 * live Telegram): mocks the repository/client/env module boundaries this
 * route calls, exactly like app/api/admin/media/route.test.ts mocks
 * getCloudflareContext at the binding boundary. Mirrors
 * assistant/tests/telegram_webhook.rs's coverage. */

const mockUpsertUser = vi.fn(async () => ({}));
const mockUpsertChat = vi.fn(async () => ({}));
const mockSendMessage = vi.fn(async () => {});
const mockAnswerCallbackQuery = vi.fn(async () => {});
const mockFetchTodayText = vi.fn(async () => 'today-text');

vi.mock('@/lib/d1/repositories/telegram', () => ({
  upsertTelegramUser: mockUpsertUser,
  upsertTelegramChat: mockUpsertChat,
}));

vi.mock('@/lib/telegram/content', () => ({
  fetchTodayText: mockFetchTodayText,
  fetchPrayerText: vi.fn(async () => 'prayer-text'),
  fetchSaintText: vi.fn(async () => 'saint-text'),
  fetchGospelText: vi.fn(async () => 'gospel-text'),
}));

vi.mock('@/lib/telegram/client', () => ({
  TelegramClient: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    answerCallbackQuery: mockAnswerCallbackQuery,
  })),
}));

let mockConfig: TelegramConfig | null = {
  botToken: 'fake-token-for-tests',
  webhookSecret: 'expected-secret',
  channel: '@svit_ikony',
};

vi.mock('@/lib/telegram/env', () => ({
  getTelegramConfig: async () => mockConfig,
}));

const { POST } = await import('./route');

function webhookRequest(body: unknown, secretHeader?: string) {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secretHeader !== undefined ? { 'X-Telegram-Bot-Api-Secret-Token': secretHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/telegram/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = { botToken: 'fake-token-for-tests', webhookSecret: 'expected-secret', channel: '@svit_ikony' };
  });

  it('returns 503 when Telegram is not configured', async () => {
    mockConfig = null;
    const response = await POST(webhookRequest({ update_id: 1 }));
    expect(response.status).toBe(503);
  });

  it('rejects a missing secret header with 401', async () => {
    const response = await POST(webhookRequest({ update_id: 1 }));
    expect(response.status).toBe(401);
  });

  it('rejects a wrong secret header with 401', async () => {
    const response = await POST(webhookRequest({ update_id: 1 }, 'wrong-secret'));
    expect(response.status).toBe(401);
  });

  it('accepts a matching secret with an empty update and touches neither D1 nor Telegram', async () => {
    const response = await POST(webhookRequest({ update_id: 1 }, 'expected-secret'));
    expect(response.status).toBe(200);
    expect(mockUpsertUser).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('/start upserts the user and chat, then replies with the welcome text', async () => {
    const response = await POST(
      webhookRequest(
        {
          update_id: 2,
          message: {
            message_id: 10,
            chat: { id: 555, type: 'private' },
            from: { id: 999, username: 'ivan', first_name: 'Ivan' },
            text: '/start',
          },
        },
        'expected-secret'
      )
    );

    expect(response.status).toBe(200);
    expect(mockUpsertUser).toHaveBeenCalledWith(expect.objectContaining({ telegramUserId: 999, username: 'ivan' }));
    expect(mockUpsertChat).toHaveBeenCalledWith(expect.objectContaining({ telegramChatId: 555, chatType: 'private' }));
    expect(mockSendMessage).toHaveBeenCalledWith(555, expect.stringContaining('Світло Ікони'), expect.anything());
  });

  it('ignores free-text messages without a slash command', async () => {
    const response = await POST(
      webhookRequest(
        {
          update_id: 3,
          message: { message_id: 11, chat: { id: 555, type: 'private' }, text: 'Слава Ісусу Христу' },
        },
        'expected-secret'
      )
    );
    expect(response.status).toBe(200);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('a "today" callback_query answers the callback and sends the today text', async () => {
    const response = await POST(
      webhookRequest(
        {
          update_id: 4,
          callback_query: {
            id: 'cbq-1',
            from: { id: 999, username: 'ivan' },
            message: { message_id: 12, chat: { id: 555, type: 'private' } },
            data: 'today',
          },
        },
        'expected-secret'
      )
    );

    expect(response.status).toBe(200);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith('cbq-1');
    expect(mockFetchTodayText).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(555, 'today-text', expect.anything());
  });

  it('returns 400 for an unparseable body', async () => {
    const response = await POST(
      new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'expected-secret' },
        body: 'not json',
      })
    );
    expect(response.status).toBe(400);
  });
});
