import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminTelegramApiError, AdminTelegramClient } from './admin-bot-client';

afterEach(() => vi.restoreAllMocks());

describe('AdminTelegramClient', () => {
  it('sendMessage posts to the admin bot token URL with the text and optional reply markup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AdminTelegramClient('fake-token-123');
    await client.sendMessage(42, 'hello', { inline_keyboard: [[{ text: 'Open', url: 'https://example.com' }]] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/botfake-token-123/sendMessage');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ chat_id: 42, text: 'hello', reply_markup: { inline_keyboard: [[{ text: 'Open', url: 'https://example.com' }]] } });

    vi.unstubAllGlobals();
  });

  it('throws AdminTelegramApiError on a Telegram-reported failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked' }), { status: 403 })));
    const client = new AdminTelegramClient('fake-token-123');
    await expect(client.sendMessage(1, 'x')).rejects.toBeInstanceOf(AdminTelegramApiError);
    vi.unstubAllGlobals();
  });

  it('never includes the bot token in any console.warn call on failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: 'boom' }), { status: 500 })));

    const client = new AdminTelegramClient('super-secret-admin-bot-token');
    await expect(client.sendMessage(1, 'x')).rejects.toThrow();

    for (const call of warnSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('super-secret-admin-bot-token');
    }
    vi.unstubAllGlobals();
  });
});
