import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockGetTelegramPost = vi.fn();
const mockMarkTelegramPostSent = vi.fn();
const mockMarkTelegramPostFailed = vi.fn();
const mockRecordDeliveryLog = vi.fn();

vi.mock('@/lib/d1/repositories/telegram', () => ({
  getTelegramPost: mockGetTelegramPost,
  markTelegramPostSent: mockMarkTelegramPostSent,
  markTelegramPostFailed: mockMarkTelegramPostFailed,
  recordDeliveryLog: mockRecordDeliveryLog,
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
vi.mock('@/lib/telegram/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telegram/client')>('@/lib/telegram/client');
  return {
    ...actual,
    TelegramClient: vi.fn().mockImplementation(() => ({
      sendMessage: mockSendMessage,
      sendPhoto: mockSendPhoto,
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
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(1, 555);
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
    });
    mockLoadAutopostFacts.mockResolvedValue({ facts: 'real facts from D1', sourceType: 'saint', sourceId: 'abc' });
    mockGenerateTelegramPost.mockResolvedValue('Generated Ukrainian post text');
    mockSetAutopostDraftText.mockResolvedValue({
      id: 3,
      status: 'failed',
      text: 'Generated Ukrainian post text',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
    });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 3, status: 'sent', telegramMessageId: 999 });
    mockSendMessage.mockResolvedValue({ messageId: 999 });

    const response = await POST(publishRequest('3', token), ctx('3'));

    expect(mockLoadAutopostFacts).toHaveBeenCalledWith('saint_of_day', '2026-08-30');
    expect(mockGenerateTelegramPost).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'fake-key-for-tests', facts: 'real facts from D1' })
    );
    expect(mockSetAutopostDraftText).toHaveBeenCalledWith(3, 'Generated Ukrainian post text');
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Generated Ukrainian post text');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(3, 999);
    expect(response.status).toBe(200);
  });

  it('does not regenerate when the autopost row already has text (Telegram-only failure)', async () => {
    mockGetTelegramPost.mockResolvedValue({
      id: 4,
      status: 'failed',
      text: 'Already generated earlier',
      mediaUrl: null,
      contentType: 'saint_of_day',
      publishDate: '2026-08-30',
    });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 4, status: 'sent', telegramMessageId: 111 });
    mockSendMessage.mockResolvedValue({ messageId: 111 });

    const response = await POST(publishRequest('4', token), ctx('4'));

    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockLoadAutopostFacts).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Already generated earlier');
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
    });
    mockLoadAutopostFacts.mockResolvedValue(null);

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
    });
    mockLoadAutopostFacts.mockResolvedValue({ facts: 'real facts', sourceType: 'saint', sourceId: 'abc' });
    mockGenerateTelegramPost.mockRejectedValueOnce(new Error('no credits remaining'));

    const response = await POST(publishRequest('6', token), ctx('6'));

    expect(response.status).toBe(502);
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(6, 'no credits remaining');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
