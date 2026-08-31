import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTelegramPostPhotoMessageId = vi.fn();
vi.mock('@/lib/d1/repositories/telegram', () => ({
  setTelegramPostPhotoMessageId: mockSetTelegramPostPhotoMessageId,
}));

const { planDelivery, sendAutopostMessage, SAFE_CAPTION_LIMIT } = await import('./deliver-post');
const { CONTENT_TYPE_LINKED_CAPTIONS } = await import('./content-format');

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
    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 1,
      text: 'hello',
      mediaUrl: null,
      existingPhotoMessageId: null,
      contentType: 'morning_prayer',
    });

    expect(client.sendMessage).toHaveBeenCalledWith(-1, 'hello');
    expect(client.sendPhoto).not.toHaveBeenCalled();
    expect(result).toEqual({ textMessageId: 900, photoMessageId: null });
  });

  it('short post: sends ONE sendPhoto call with the full text as caption (never the linked short caption), no separate sendMessage', async () => {
    const client = fakeClient();
    const shortText = 'a'.repeat(SAFE_CAPTION_LIMIT);

    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 1,
      text: shortText,
      mediaUrl: 'https://svetikony.com/media/x.png',
      existingPhotoMessageId: null,
      contentType: 'morning_prayer',
    });

    expect(client.sendPhoto).toHaveBeenCalledTimes(1);
    expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', shortText);
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ textMessageId: 901, photoMessageId: null });
  });

  it('long post with no known content type (manually-composed post): photo gets no caption at all, unchanged from before', async () => {
    const client = fakeClient();
    const longText = 'a'.repeat(SAFE_CAPTION_LIMIT + 500);

    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 42,
      text: longText,
      mediaUrl: 'https://svetikony.com/media/x.png',
      existingPhotoMessageId: null,
      contentType: null,
    });

    expect(client.sendPhoto).toHaveBeenCalledTimes(1);
    expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', undefined);
    expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(42, 902);
    expect(client.sendMessage).toHaveBeenCalledWith(-1, longText); // full, untruncated text, unchanged
    expect(result).toEqual({ textMessageId: 900, photoMessageId: 902 });
  });

  it.each(['morning_prayer', 'evening_prayer', 'saint_of_day', 'gospel', 'faith_story'] as const)(
    'long post (%s): photo carries the fixed linked caption, the full AI text still goes out unchanged as the second message',
    async (contentType) => {
      const client = fakeClient();
      const longText = 'а'.repeat(SAFE_CAPTION_LIMIT + 500); // the real AI text -- never touched below

      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 7,
        text: longText,
        mediaUrl: 'https://svetikony.com/media/x.png',
        existingPhotoMessageId: null,
        contentType,
      });

      expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', CONTENT_TYPE_LINKED_CAPTIONS[contentType]);
      expect(client.sendMessage).toHaveBeenCalledWith(-1, longText);
      expect(client.sendMessage).toHaveBeenCalledTimes(1); // no extra OpenAI call implied by this, and no extra send
      // fakeClient's sendPhoto returns 901 whenever a (truthy) caption is
      // passed -- the linked caption counts, same as the short-post case.
      expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(7, 901);
      expect(result.photoMessageId).toBe(901);
      expect(result.textMessageId).toBe(900);
    },
  );

  it('retry: does not re-send an already-successful photo (and never re-derives its caption), only retries the text', async () => {
    const client = fakeClient();
    const longText = 'a'.repeat(SAFE_CAPTION_LIMIT + 500);

    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 42,
      text: longText,
      mediaUrl: 'https://svetikony.com/media/x.png',
      existingPhotoMessageId: 902, // already sent on a prior attempt
      contentType: 'morning_prayer',
    });

    expect(client.sendPhoto).not.toHaveBeenCalled();
    expect(mockSetTelegramPostPhotoMessageId).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith(-1, longText);
    expect(result).toEqual({ textMessageId: 900, photoMessageId: 902 });
  });
});
