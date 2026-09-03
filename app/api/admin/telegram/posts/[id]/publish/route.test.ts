import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockGetTelegramPost = vi.fn();
const mockMarkTelegramPostSent = vi.fn();
const mockMarkTelegramPostFailed = vi.fn();
const mockRecordDeliveryLog = vi.fn();
const mockSetTelegramPostPhotoMessageId = vi.fn();
const mockSetTelegramPostAudioMessageId = vi.fn();

vi.mock('@/lib/d1/repositories/telegram', () => ({
  getTelegramPost: mockGetTelegramPost,
  markTelegramPostSent: mockMarkTelegramPostSent,
  markTelegramPostFailed: mockMarkTelegramPostFailed,
  recordDeliveryLog: mockRecordDeliveryLog,
  setTelegramPostPhotoMessageId: mockSetTelegramPostPhotoMessageId,
  setTelegramPostAudioMessageId: mockSetTelegramPostAudioMessageId,
}));

const mockIsAutopostContentType = vi.fn((value: string) =>
  ['morning_prayer', 'saint_of_day', 'gospel', 'faith_story', 'evening_prayer'].includes(value)
);
const mockSetAutopostDraftText = vi.fn();
vi.mock('@/lib/d1/repositories/telegram-autopost', () => ({
  isAutopostContentType: mockIsAutopostContentType,
  setAutopostDraftText: mockSetAutopostDraftText,
}));

const mockLoadAutopostFacts = vi.fn();
vi.mock('@/lib/telegram/autopost-content', () => ({
  loadAutopostFacts: mockLoadAutopostFacts,
}));

/** Defaults to "no image" so every pre-existing assertion below keeps
 * working without needing to know about the image step; dedicated tests
 * further down override this per-case. */
const mockEnsureAutopostImage = vi.fn<() => Promise<string | null>>(async () => null);
vi.mock('@/lib/telegram/autopost-image', () => ({
  ensureAutopostImage: mockEnsureAutopostImage,
}));

const mockGenerateTelegramPost = vi.fn();
vi.mock('@/lib/ai/openai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/openai')>('@/lib/ai/openai');
  return { ...actual, generateTelegramPost: mockGenerateTelegramPost };
});

const mockGetOrResolveChannelChat = vi.fn(async () => ({ telegramChatId: -100999 }));
vi.mock('@/lib/telegram/channel', () => ({
  getOrResolveChannelChat: mockGetOrResolveChannelChat,
}));

const mockSendMessage = vi.fn(async () => ({ messageId: 555 }));
const mockSendPhoto = vi.fn(async () => ({ messageId: 556 }));
const mockSendAudio = vi.fn(async () => ({ messageId: 951 }));
vi.mock('@/lib/telegram/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telegram/client')>('@/lib/telegram/client');
  return {
    ...actual,
    TelegramClient: vi.fn().mockImplementation(() => ({
      sendMessage: mockSendMessage,
      sendPhoto: mockSendPhoto,
      sendAudio: mockSendAudio,
    })),
  };
});

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: {
      ADMIN_JWT_SECRET: TEST_JWT_SECRET,
      TELEGRAM_BOT_TOKEN: 'fake-token-for-tests',
      TELEGRAM_CHANNEL: '@svit_ikony',
      OPENAI_API_KEY: 'fake-key-for-tests',
    },
  }),
}));

const { POST } = await import('./route');

function publishRequest(id: string, token?: string) {
  return new Request(`http://localhost/api/admin/telegram/posts/${id}/publish`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/telegram/posts/:id/publish', () => {
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetOrResolveChannelChat.mockResolvedValue({ telegramChatId: -100999 });
    mockSendMessage.mockResolvedValue({ messageId: 555 });
    mockEnsureAutopostImage.mockResolvedValue(null);
    token = await mintTestAdminJwt();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await POST(publishRequest('1'), ctx('1'));
    expect(response.status).toBe(401);
    expect(mockGetTelegramPost).not.toHaveBeenCalled();
  });

  it('rejects a non-integer id with 400', async () => {
    const response = await POST(publishRequest('not-a-number', token), ctx('not-a-number'));
    expect(response.status).toBe(400);
  });

  it('rejects double-publish with 409 without calling Telegram', async () => {
    mockGetTelegramPost.mockResolvedValue({ id: 1, status: 'sent', text: 'x', mediaUrl: null });

    const response = await POST(publishRequest('1', token), ctx('1'));

    expect(response.status).toBe(409);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendPhoto).not.toHaveBeenCalled();
  });

  it('publishes a text-only draft and marks it sent with the real telegram_message_id', async () => {
    mockGetTelegramPost.mockResolvedValue({ id: 1, status: 'draft', text: 'Hello', mediaUrl: null, contentType: null, publishDate: null });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 1, status: 'sent', telegramMessageId: 555 });

    const response = await POST(publishRequest('1', token), ctx('1'));

    expect(response.status).toBe(200);
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Hello');
    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(1, 555, null, null);
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith({
      telegramPostId: 1,
      telegramChatId: -100999,
      telegramMessageId: 555,
      status: 'success',
    });
  });

  it('sends a photo instead of a text message when mediaUrl is set', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 2,
      status: 'draft',
      text: 'Caption',
      mediaUrl: 'https://example.com/x.jpg',
      contentType: null,
      publishDate: null,
    });
    mockSendPhoto.mockResolvedValue({ messageId: 556 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 2, status: 'sent', telegramMessageId: 556 });

    const response = await POST(publishRequest('2', token), ctx('2'));

    expect(response.status).toBe(200);
    expect(mockSendPhoto).toHaveBeenCalledWith(-100999, 'https://example.com/x.jpg', 'Caption');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('marks the post failed (not silently left as draft) when the Telegram call throws', async () => {
    mockGetTelegramPost.mockResolvedValue({ id: 1, status: 'draft', text: 'Hello', mediaUrl: null, contentType: null, publishDate: null });
    mockSendMessage.mockRejectedValueOnce(new Error('bot was kicked from the channel'));

    const response = await POST(publishRequest('1', token), ctx('1'));

    expect(response.status).toBe(502);
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(1, 'bot was kicked from the channel');
    expect(mockMarkTelegramPostSent).not.toHaveBeenCalled();
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith({
      telegramPostId: 1,
      telegramChatId: -100999,
      telegramMessageId: null,
      status: 'failed',
      errorMessage: 'bot was kicked from the channel',
    });
  });

  it('regenerates text via OpenAI for an autopost row that failed before generation, then sends it', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 3,
      status: 'failed',
      text: null,
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'real facts from D1', sourceType: 'saint', sourceId: 'abc' },
    });
    mockGenerateTelegramPost.mockResolvedValue('Згенерований текст публікації');
    mockSetAutopostDraftText.mockResolvedValue({
      id: 3,
      status: 'failed',
      text: 'Згенерований текст публікації',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 3, status: 'sent', telegramMessageId: 999 });
    mockSendMessage.mockResolvedValue({ messageId: 999 });

    const response = await POST(publishRequest('3', token), ctx('3'));

    // publishDate ('2026-08-30', civil Europe/Kyiv) must be converted to the
    // Julian/old-style date ('2026-08-17') before the source lookup -- see
    // julian-calendar.test.ts for how that 13-day conversion is verified.
    expect(mockLoadAutopostFacts).toHaveBeenCalledWith('saint_of_day', '2026-08-17');
    expect(mockGenerateTelegramPost).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'fake-key-for-tests',
        facts: 'real facts from D1',
        civilDateIso: '2026-08-30',
        julianDateIso: '2026-08-17',
      })
    );
    expect(mockSetAutopostDraftText).toHaveBeenCalledWith(3, 'Згенерований текст публікації');
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Згенерований текст публікації');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(3, 999, null, null);
    expect(response.status).toBe(200);
  });

  it('does not regenerate when the autopost row already has text (Telegram-only failure)', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 4,
      status: 'failed',
      text: 'Текст уже згенеровано раніше',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 4, status: 'sent', telegramMessageId: 111 });
    mockSendMessage.mockResolvedValue({ messageId: 111 });

    const response = await POST(publishRequest('4', token), ctx('4'));

    // loadAutopostFacts may still be called once here -- not to regenerate
    // TEXT (that's what mockGenerateTelegramPost/mockSetAutopostDraftText
    // guard below), but by ensureAutopostImageIfMissing's own best-effort
    // verified-image-asset lookup for the missing mediaUrl (see
    // "passes the verified saint image asset through..." below).
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockSetAutopostDraftText).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Текст уже згенеровано раніше');
    expect(response.status).toBe(200);
  });

  it('does not regenerate the image when the autopost row already has a saved mediaUrl', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 7,
      status: 'failed',
      text: 'Текст уже згенеровано раніше',
      mediaUrl: 'https://svetikony.com/media/telegram/7/post-image/existing.png',
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockSendPhoto.mockResolvedValue({ messageId: 777 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 7, status: 'sent', telegramMessageId: 777 });

    const response = await POST(publishRequest('7', token), ctx('7'));

    expect(mockEnsureAutopostImage).not.toHaveBeenCalled();
    expect(mockSendPhoto).toHaveBeenCalledWith(
      -100999,
      'https://svetikony.com/media/telegram/7/post-image/existing.png',
      'Текст уже згенеровано раніше'
    );
    expect(response.status).toBe(200);
  });

  it('generates a fresh image via sendPhoto when the autopost row has text but no mediaUrl yet', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 8,
      status: 'failed',
      text: 'Текст уже згенеровано раніше',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockEnsureAutopostImage.mockResolvedValue('https://svetikony.com/media/telegram/8/post-image/new.png');
    mockSendPhoto.mockResolvedValue({ messageId: 888 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 8, status: 'sent', telegramMessageId: 888 });

    const response = await POST(publishRequest('8', token), ctx('8'));

    expect(mockEnsureAutopostImage).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 8, existingMediaUrl: null, contentType: 'saint_of_day', apiKey: 'fake-key-for-tests' })
    );
    expect(mockSendPhoto).toHaveBeenCalledWith(
      -100999,
      'https://svetikony.com/media/telegram/8/post-image/new.png',
      'Текст уже згенеровано раніше'
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('passes the verified saint image asset through to ensureAutopostImage on retry, re-deriving facts from publishDate', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 11,
      status: 'failed',
      text: 'Текст уже згенеровано раніше',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'real facts', sourceType: 'saint', sourceId: 'abc', verifiedImageUrl: 'media/saints/florus/main/x.jpg' },
    });
    mockEnsureAutopostImage.mockResolvedValue('https://svetikony.com/media/saints/florus/main/x.jpg');
    mockSendPhoto.mockResolvedValue({ messageId: 1101 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 11, status: 'sent', telegramMessageId: 1101 });

    const response = await POST(publishRequest('11', token), ctx('11'));

    expect(mockLoadAutopostFacts).toHaveBeenCalledWith('saint_of_day', '2026-08-17');
    expect(mockEnsureAutopostImage).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 11, contentType: 'saint_of_day', verifiedImageUrl: 'media/saints/florus/main/x.jpg' })
    );
    expect(response.status).toBe(200);
  });

  it('still falls back to AI-generation-eligible behavior when re-deriving facts for the verified image fails on retry', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 12,
      status: 'failed',
      text: 'Текст уже згенеровано раніше',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockLoadAutopostFacts.mockRejectedValue(new Error('D1 unavailable'));
    mockEnsureAutopostImage.mockResolvedValue('https://svetikony.com/media/telegram/12/post-image/new.png');
    mockSendPhoto.mockResolvedValue({ messageId: 1201 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 12, status: 'sent', telegramMessageId: 1201 });

    const response = await POST(publishRequest('12', token), ctx('12'));

    expect(mockEnsureAutopostImage).toHaveBeenCalledWith(expect.objectContaining({ postId: 12, verifiedImageUrl: undefined }));
    expect(response.status).toBe(200);
  });

  it('long text (retry): photo gets the fixed linked caption for the content type, full text goes out unchanged as a separate message', async () => {
    const longText = 'Вже згенерований текст. '.repeat(60); // > 1000 chars
    mockGetTelegramPost.mockResolvedValue({
      id: 10,
      status: 'failed',
      text: longText,
      mediaUrl: 'https://svetikony.com/media/telegram/10/post-image/existing.png',
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
      telegramPhotoMessageId: null,
    });
    mockSendPhoto.mockResolvedValue({ messageId: 1001 });
    mockSendMessage.mockResolvedValue({ messageId: 1002 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 10, status: 'sent', telegramMessageId: 1002 });

    const response = await POST(publishRequest('10', token), ctx('10'));

    expect(mockSendPhoto).toHaveBeenCalledWith(
      -100999,
      'https://svetikony.com/media/telegram/10/post-image/existing.png',
      '☀️ Святий дня\n☦️ Продовження — у наступному повідомленні.'
    );
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, longText); // full, untruncated text
    expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(10, 1001);
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(10, 1002, 1001, null);
    expect(response.status).toBe(200);
  });

  it('sends a manually-assigned audio file alongside a photo (photo_and_audio_then_text) with independent message ids', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 13,
      status: 'failed',
      text: 'Короткий текст.',
      mediaUrl: 'https://svetikony.com/media/telegram/13/post-image/x.png',
      audioUrl: 'https://svetikony.com/media/telegram/13/post-audio/a.mp3',
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
      telegramPhotoMessageId: null,
      telegramAudioMessageId: null,
    });
    mockSendPhoto.mockResolvedValue({ messageId: 1301 });
    mockSendAudio.mockResolvedValue({ messageId: 1351 });
    mockSendMessage.mockResolvedValue({ messageId: 1302 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 13, status: 'sent', telegramMessageId: 1302 });

    const response = await POST(publishRequest('13', token), ctx('13'));

    expect(mockSendPhoto).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/13/post-image/x.png', expect.any(String));
    expect(mockSendAudio).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/13/post-audio/a.mp3', expect.any(String));
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Короткий текст.');
    expect(mockSetTelegramPostAudioMessageId).toHaveBeenCalledWith(13, 1351);
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(13, 1302, 1301, 1351);
    expect(response.status).toBe(200);
  });

  it('retry: reuses an already-sent audio message id, never re-sending it', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 14,
      status: 'failed',
      text: 'Текст.',
      mediaUrl: null,
      audioUrl: 'https://svetikony.com/media/telegram/14/post-audio/a.mp3',
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
      telegramPhotoMessageId: null,
      telegramAudioMessageId: 1351, // already sent in a previous attempt
    });
    mockSendMessage.mockResolvedValue({ messageId: 1402 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 14, status: 'sent', telegramMessageId: 1402 });

    const response = await POST(publishRequest('14', token), ctx('14'));

    expect(mockSendAudio).not.toHaveBeenCalled();
    expect(mockSetTelegramPostAudioMessageId).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Текст.');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(14, 1402, null, 1351);
    expect(response.status).toBe(200);
  });

  it('falls back to sendMessage when image generation fails during retry, and still publishes the text', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 9,
      status: 'failed',
      text: 'Текст уже згенеровано раніше',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockEnsureAutopostImage.mockResolvedValue(null); // ensureAutopostImage itself never throws -- see autopost-image.test.ts
    mockSendMessage.mockResolvedValue({ messageId: 999 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 9, status: 'sent', telegramMessageId: 999 });

    const response = await POST(publishRequest('9', token), ctx('9'));

    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Текст уже згенеровано раніше');
    expect(response.status).toBe(200);
  });

  it('fails with 400 and never calls Telegram when source facts are no longer available', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 5,
      status: 'failed',
      text: null,
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockLoadAutopostFacts.mockResolvedValue({ status: 'missing_source' });

    const response = await POST(publishRequest('5', token), ctx('5'));

    expect(response.status).toBe(400);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
  });

  it('marks the post failed and returns 502 when regeneration itself throws', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 6,
      status: 'failed',
      text: null,
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
      verificationStatus: 'verified',
    });
    mockLoadAutopostFacts.mockResolvedValue({ status: 'ok', facts: { facts: 'real facts', sourceType: 'saint', sourceId: 'abc' } });
    mockGenerateTelegramPost.mockRejectedValueOnce(new Error('no credits remaining'));

    const response = await POST(publishRequest('6', token), ctx('6'));

    expect(response.status).toBe(502);
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(6, 'no credits remaining');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
