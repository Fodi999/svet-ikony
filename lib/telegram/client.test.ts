import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramClient } from './client';

function mockTelegramFetch(resultMessageId: number) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    return new Response(JSON.stringify({ ok: true, result: { message_id: resultMessageId, ...body } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('TelegramClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sendMessage does not truncate a realistic long text (up to faith_story\'s 4000-char target)', async () => {
    const longText = 'а'.repeat(4000);
    const fetchMock = mockTelegramFetch(1);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    await client.sendMessage(-100999, longText);

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.text).toBe(longText);
    expect(sentBody.text).toHaveLength(4000);
  });

  it('sendMessage still truncates text that exceeds Telegram\'s real hard limit (safety net, not a normal autopost case)', async () => {
    const excessiveText = 'а'.repeat(5000);
    const fetchMock = mockTelegramFetch(1);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    await client.sendMessage(-100999, excessiveText);

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.text.length).toBeLessThan(5000);
  });

  it('sendPhoto passes the caption through exactly as given, never truncating it', async () => {
    const longCaption = 'б'.repeat(1500); // longer than the old 950-char cap this replaced
    const fetchMock = mockTelegramFetch(2);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    await client.sendPhoto(-100999, 'https://svetikony.com/media/x.png', longCaption);

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.caption).toBe(longCaption);
  });

  it('sendAudio calls the sendAudio method with the audio URL and returns its message id', async () => {
    const fetchMock = mockTelegramFetch(3);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    const result = await client.sendAudio(-100999, 'https://svetikony.com/media/a.mp3', 'caption');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/sendAudio');
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.audio).toBe('https://svetikony.com/media/a.mp3');
    expect(sentBody.caption).toBe('caption');
    expect(result).toEqual({ messageId: 3 });
  });

  it('sendMessage passes a URL-button inline keyboard through as reply_markup (task: daily site-link CTA broadcast)', async () => {
    const fetchMock = mockTelegramFetch(4);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    await client.sendMessage(-100999, 'text', {
      inline_keyboard: [[{ text: 'Перейти на сайт', url: 'https://svetikony.com/' }]],
    });

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Перейти на сайт', url: 'https://svetikony.com/' }]] });
  });

  it('sendMessage omits reply_markup entirely when none is given', async () => {
    const fetchMock = mockTelegramFetch(1);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    await client.sendMessage(-100999, 'text');

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody).not.toHaveProperty('reply_markup');
  });

  it('sendAudio omits the caption field entirely when none is given', async () => {
    const fetchMock = mockTelegramFetch(3);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TelegramClient('fake-token');
    await client.sendAudio(-100999, 'https://svetikony.com/media/a.mp3');

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody).not.toHaveProperty('caption');
  });
});
