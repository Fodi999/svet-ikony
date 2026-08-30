import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockGetTelegramPost = vi.fn();
const mockMarkTelegramPostSent = vi.fn();
const mockMarkTelegramPostFailed = vi.fn();

vi.mock('@/lib/d1/repositories/telegram', () => ({
  getTelegramPost: mockGetTelegramPost,
  markTelegramPostSent: mockMarkTelegramPostSent,
  markTelegramPostFailed: mockMarkTelegramPostFailed,
}));

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
    env: { ADMIN_JWT_SECRET: TEST_JWT_SECRET, TELEGRAM_BOT_TOKEN: 'fake-token-for-tests', TELEGRAM_CHANNEL: '@svit_ikony' },
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
    mockGetTelegramPost.mockResolvedValue({ id: 1, status: 'draft', text: 'Hello', mediaUrl: null });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 1, status: 'sent', telegramMessageId: 555 });

    const response = await POST(publishRequest('1', token), ctx('1'));

    expect(response.status).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Hello');
    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(1, 555);
  });

  it('sends a photo instead of a text message when mediaUrl is set', async () => {
    mockGetTelegramPost.mockResolvedValue({ id: 2, status: 'draft', text: 'Caption', mediaUrl: 'https://example.com/x.jpg' });
    mockSendPhoto.mockResolvedValue({ messageId: 556 });
    mockMarkTelegramPostSent.mockResolvedValue({ id: 2, status: 'sent', telegramMessageId: 556 });

    const response = await POST(publishRequest('2', token), ctx('2'));

    expect(response.status).toBe(200);
    expect(mockSendPhoto).toHaveBeenCalledWith(-100999, 'https://example.com/x.jpg', 'Caption');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('marks the post failed (not silently left as draft) when the Telegram call throws', async () => {
    mockGetTelegramPost.mockResolvedValue({ id: 1, status: 'draft', text: 'Hello', mediaUrl: null });
    mockSendMessage.mockRejectedValueOnce(new Error('bot was kicked from the channel'));

    const response = await POST(publishRequest('1', token), ctx('1'));

    expect(response.status).toBe(502);
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(1, 'bot was kicked from the channel');
    expect(mockMarkTelegramPostSent).not.toHaveBeenCalled();
  });
});
