import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTelegramPostPhotoMessageId = vi.fn();
const mockSetTelegramPostAudioMessageId = vi.fn();
vi.mock('@/lib/d1/repositories/telegram', () => ({
  setTelegramPostPhotoMessageId: mockSetTelegramPostPhotoMessageId,
  setTelegramPostAudioMessageId: mockSetTelegramPostAudioMessageId,
}));

const { planDelivery, sendAutopostMessage, SAFE_CAPTION_LIMIT } = await import('./deliver-post');
const { CONTENT_TYPE_AUDIO_CAPTIONS, CONTENT_TYPE_LINKED_CAPTIONS } = await import('./content-format');

describe('planDelivery', () => {
  it('plans text_only when there is no image and no audio', () => {
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

  it('plans audio_then_text whenever audio is present and there is no photo, regardless of text length', () => {
    const short = planDelivery('short text', null, 'https://svetikony.com/media/a.mp3');
    const long = planDelivery('a'.repeat(SAFE_CAPTION_LIMIT), null, 'https://svetikony.com/media/a.mp3');
    expect(short).toEqual({ kind: 'audio_then_text' });
    expect(long).toEqual({ kind: 'audio_then_text' });
  });

  it('plans photo_and_audio_then_text whenever both are present, even when the text would otherwise fit a photo caption -- no single message type carries photo+audio+text together', () => {
    const plan = planDelivery('short', 'https://svetikony.com/media/x.png', 'https://svetikony.com/media/a.mp3');
    expect(plan).toEqual({ kind: 'photo_and_audio_then_text' });
  });
});

function fakeClient() {
  return {
    sendMessage: vi.fn(async (_chatId: unknown, _text: string) => ({ messageId: 900 })),
    sendPhoto: vi.fn(async (_chatId: unknown, _url: string, caption?: string) => ({ messageId: caption ? 901 : 902 })),
    sendAudio: vi.fn(async (_chatId: unknown, _url: string, caption?: string) => ({ messageId: caption ? 951 : 952 })),
  } as unknown as import('./client').TelegramClient;
}

describe('sendAutopostMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only sendMessage when there is no image and no audio', async () => {
    const client = fakeClient();
    const result = await sendAutopostMessage({
      client,
      chatId: -1,
      postId: 1,
      text: 'hello',
      mediaUrl: null,
      audioUrl: null,
      existingPhotoMessageId: null,
      existingAudioMessageId: null,
      contentType: 'morning_prayer',
    });

    expect(client.sendMessage).toHaveBeenCalledWith(-1, 'hello');
    expect(client.sendPhoto).not.toHaveBeenCalled();
    expect(client.sendAudio).not.toHaveBeenCalled();
    expect(result).toEqual({ textMessageId: 900, photoMessageId: null, audioMessageId: null });
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
      audioUrl: null,
      existingPhotoMessageId: null,
      existingAudioMessageId: null,
      contentType: 'morning_prayer',
    });

    expect(client.sendPhoto).toHaveBeenCalledTimes(1);
    expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', shortText);
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(client.sendAudio).not.toHaveBeenCalled();
    expect(result).toEqual({ textMessageId: 901, photoMessageId: null, audioMessageId: null });
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
      audioUrl: null,
      existingPhotoMessageId: null,
      existingAudioMessageId: null,
      contentType: null,
    });

    expect(client.sendPhoto).toHaveBeenCalledTimes(1);
    expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', undefined);
    expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(42, 902);
    expect(client.sendMessage).toHaveBeenCalledWith(-1, longText); // full, untruncated text, unchanged
    expect(result).toEqual({ textMessageId: 900, photoMessageId: 902, audioMessageId: null });
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
        audioUrl: null,
        existingPhotoMessageId: null,
        existingAudioMessageId: null,
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
      expect(result.audioMessageId).toBeNull();
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
      audioUrl: null,
      existingPhotoMessageId: 902, // already sent on a prior attempt
      existingAudioMessageId: null,
      contentType: 'morning_prayer',
    });

    expect(client.sendPhoto).not.toHaveBeenCalled();
    expect(mockSetTelegramPostPhotoMessageId).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith(-1, longText);
    expect(result).toEqual({ textMessageId: 900, photoMessageId: 902, audioMessageId: null });
  });

  describe('audio_then_text', () => {
    it('sends sendAudio with the linked audio caption, then the full text as a separate message, regardless of text length', async () => {
      const client = fakeClient();
      const shortText = 'короткий текст';

      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 10,
        text: shortText,
        mediaUrl: null,
        audioUrl: 'https://svetikony.com/media/a.mp3',
        existingPhotoMessageId: null,
        existingAudioMessageId: null,
        contentType: 'gospel',
      });

      expect(client.sendPhoto).not.toHaveBeenCalled();
      expect(client.sendAudio).toHaveBeenCalledTimes(1);
      expect(client.sendAudio).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/a.mp3', CONTENT_TYPE_AUDIO_CAPTIONS.gospel);
      expect(mockSetTelegramPostAudioMessageId).toHaveBeenCalledWith(10, 951);
      expect(client.sendMessage).toHaveBeenCalledWith(-1, shortText);
      expect(result).toEqual({ textMessageId: 900, photoMessageId: null, audioMessageId: 951 });
    });

    it('manually-composed post (contentType null): audio gets no caption at all', async () => {
      const client = fakeClient();
      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 11,
        text: 'text',
        mediaUrl: null,
        audioUrl: 'https://svetikony.com/media/a.mp3',
        existingPhotoMessageId: null,
        existingAudioMessageId: null,
        contentType: null,
      });

      expect(client.sendAudio).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/a.mp3', undefined);
      expect(result.audioMessageId).toBe(952);
    });

    it('retry: does not re-send an already-successful audio, only retries the text', async () => {
      const client = fakeClient();
      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 12,
        text: 'text',
        mediaUrl: null,
        audioUrl: 'https://svetikony.com/media/a.mp3',
        existingPhotoMessageId: null,
        existingAudioMessageId: 951, // already sent on a prior attempt
        contentType: 'gospel',
      });

      expect(client.sendAudio).not.toHaveBeenCalled();
      expect(mockSetTelegramPostAudioMessageId).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(-1, 'text');
      expect(result).toEqual({ textMessageId: 900, photoMessageId: null, audioMessageId: 951 });
    });
  });

  describe('photo_and_audio_then_text', () => {
    it('sends photo, then audio, then text -- three independent messages with three independent ids, even for a short text', async () => {
      const client = fakeClient();
      const shortText = 'коротко';

      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 20,
        text: shortText,
        mediaUrl: 'https://svetikony.com/media/x.png',
        audioUrl: 'https://svetikony.com/media/a.mp3',
        existingPhotoMessageId: null,
        existingAudioMessageId: null,
        contentType: 'saint_of_day',
      });

      expect(client.sendPhoto).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/x.png', CONTENT_TYPE_LINKED_CAPTIONS.saint_of_day);
      expect(client.sendAudio).toHaveBeenCalledWith(-1, 'https://svetikony.com/media/a.mp3', CONTENT_TYPE_AUDIO_CAPTIONS.saint_of_day);
      expect(client.sendMessage).toHaveBeenCalledWith(-1, shortText);
      expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(20, 901);
      expect(mockSetTelegramPostAudioMessageId).toHaveBeenCalledWith(20, 951);
      expect(result).toEqual({ textMessageId: 900, photoMessageId: 901, audioMessageId: 951 });
    });

    it('retry after only the photo succeeded: re-sends audio and text, never re-sends the photo', async () => {
      const client = fakeClient();
      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 21,
        text: 'text',
        mediaUrl: 'https://svetikony.com/media/x.png',
        audioUrl: 'https://svetikony.com/media/a.mp3',
        existingPhotoMessageId: 901, // already sent on a prior attempt
        existingAudioMessageId: null,
        contentType: 'saint_of_day',
      });

      expect(client.sendPhoto).not.toHaveBeenCalled();
      expect(mockSetTelegramPostPhotoMessageId).not.toHaveBeenCalled();
      expect(client.sendAudio).toHaveBeenCalledTimes(1);
      expect(mockSetTelegramPostAudioMessageId).toHaveBeenCalledWith(21, 951);
      expect(client.sendMessage).toHaveBeenCalledWith(-1, 'text');
      expect(result).toEqual({ textMessageId: 900, photoMessageId: 901, audioMessageId: 951 });
    });

    it('retry after photo and audio both succeeded: only retries the text, each part idempotent independently', async () => {
      const client = fakeClient();
      const result = await sendAutopostMessage({
        client,
        chatId: -1,
        postId: 22,
        text: 'text',
        mediaUrl: 'https://svetikony.com/media/x.png',
        audioUrl: 'https://svetikony.com/media/a.mp3',
        existingPhotoMessageId: 901,
        existingAudioMessageId: 951,
        contentType: 'saint_of_day',
      });

      expect(client.sendPhoto).not.toHaveBeenCalled();
      expect(client.sendAudio).not.toHaveBeenCalled();
      expect(mockSetTelegramPostPhotoMessageId).not.toHaveBeenCalled();
      expect(mockSetTelegramPostAudioMessageId).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(-1, 'text');
      expect(result).toEqual({ textMessageId: 900, photoMessageId: 901, audioMessageId: 951 });
    });
  });
});
