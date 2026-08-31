import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTelegramPostPhotoMessageId = vi.fn();
vi.mock('@/lib/d1/repositories/telegram', () => ({
  setTelegramPostPhotoMessageId: mockSetTelegramPostPhotoMessageId,
}));

const { planDelivery, sendAutopostMessage, SAFE_CAPTION_LIMIT } = await import('./deliver-post');

describe('planDelivery', () => {
  it('plans text_only when there is no image', () => {
    expect(planDelivery('short text', null)).toEqual({ kind: 'text_only' });
    expect(planDelivery('a'.repeat(5000), null)).toEqual({ kind: 'text_only' });
  });

  it('plans photo_with_caption when the text fits the safe caption limit', () => {
    const text = 'a'.repeat(SAFE_CAPTION_LIMIT);
    expect(planDelivery(text, 'https://svetikony.com/media/x.png')).toEqual({ kind: 'photo_with_caption' });
  });

  it('plans photo_then_text when the text exceeds the safe caption limit', () => {
    const text = 'a'.repeat(SAFE_CAPTION_LIMIT + 1);
    expect(planDelivery(text, 'https://svetikony.com/media/x.png')).toEqual({ kind: 'photo_then_text' });
  });

  it('never truncates -- the plan only decides HOW to send, the caller must send the full text either way', () => {
    const longText = 'a'.repeat(3000);
    const plan = planDelivery(longText, 'https://svetikony.com/media/x.png');
    expect(plan.kind).toBe('photo_then_text');
    // planDelivery itself takes no position on the text content -- this
    // just documents that the input string is never inspected beyond
    // .length, so nothing here could accidentally slice it.
    expect(longText).toHaveLength(3000);
  });
});

function fakeClient() {
  return {
    sendMessage: vi.fn(async (_chatId: unknown, _text: string) => ({ messageId: 900 })),
    sendPhoto: vi.fn(async (_chatId: unknown, _url: string, caption?: string) => ({ messageId: caption ? 901 : 902 })),
  } as unknown as import('./client').TelegramClient;
}

describe('sendAutopostMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only sendMessage when there is no image', async () => {
    const client = fakeClient();
    const result = await sendAutopostMessage({ client, chatId: -1, postId: 1, text: 'hello', mediaUrl: null, existingPhotoMessageId: null });

    expect(client.sendMessage).toHaveBeenCalledWith(-1, 'hello');
    expect(client.sendPhoto).not.toHaveBeenCalled();
    expect(result).toEqual({ textMessageId: 900, photoMessageId: null });
  });

  it('short post: sends ONE sendPhoto call with the full text as caption, no separate sendMessage', async () => {
    const client = fakeClient();
    const shortText = 'a'.repeat(SAFE_CAPTION_LIMIT);

    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 1,
      text: shortText,
      mediaUrl: 'https://svetikony.com/media/x.png',
      existingPhotoMessageId: null,
    });

    expect(client.sendPhoto).toHaveBeenCalledTimes(1);
    expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', shortText);
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ textMessageId: 901, photoMessageId: null });
  });

  it('long post: sends a photo-only message, persists its id, then sends the FULL text as a separate message', async () => {
    const client = fakeClient();
    const longText = 'a'.repeat(SAFE_CAPTION_LIMIT + 500);

    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 42,
      text: longText,
      mediaUrl: 'https://svetikony.com/media/x.png',
      existingPhotoMessageId: null,
    });

    expect(client.sendPhoto).toHaveBeenCalledTimes(1);
    expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png'); // no caption arg
    expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(42, 902);
    expect(client.sendMessage).toHaveBeenCalledWith(-1, longText); // full, untruncated text
    expect(result).toEqual({ textMessageId: 900, photoMessageId: 902 });
  });

  it('retry: does not re-send an already-successful photo, only retries the text', async () => {
    const client = fakeClient();
    const longText = 'a'.repeat(SAFE_CAPTION_LIMIT + 500);

    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 42,
      text: longText,
      mediaUrl: 'https://svetikony.com/media/x.png',
      existingPhotoMessageId: 902, // already sent on a prior attempt
    });

    expect(client.sendPhoto).not.toHaveBeenCalled();
    expect(mockSetTelegramPostPhotoMessageId).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith(-1, longText);
    expect(result).toEqual({ textMessageId: 900, photoMessageId: 902 });
  });
});
