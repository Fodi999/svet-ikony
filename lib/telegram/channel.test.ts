import { describe, expect, it, vi } from 'vitest';
import type { TelegramChatDto } from '@/lib/d1/repositories/telegram';

const existingChannelChat: TelegramChatDto = {
  id: 1,
  telegramChatId: -100123456789,
  chatType: 'channel',
  title: 'Світло Ікони',
  username: 'svit_ikony',
  isActive: true,
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
};

const mockListTelegramChats = vi.fn(async (): Promise<TelegramChatDto[]> => []);
const mockUpsertTelegramChat = vi.fn(async (input: { telegramChatId: number; chatType: string }) => ({
  ...existingChannelChat,
  telegramChatId: input.telegramChatId,
  chatType: input.chatType,
}));

vi.mock('@/lib/d1/repositories/telegram', () => ({
  listTelegramChats: mockListTelegramChats,
  upsertTelegramChat: mockUpsertTelegramChat,
}));

const { getOrResolveChannelChat } = await import('./channel');

function fakeClient(getChatResult: { id: number; type: string; title?: string; username?: string }) {
  return { getChat: vi.fn(async () => getChatResult) } as never;
}

describe('getOrResolveChannelChat', () => {
  it('reuses an already-resolved channel chat without calling Telegram', async () => {
    mockListTelegramChats.mockResolvedValueOnce([existingChannelChat]);
    const client = fakeClient({ id: -100999, type: 'channel' });

    const result = await getOrResolveChannelChat(client, '@svit_ikony');

    expect(result).toEqual(existingChannelChat);
    expect((client as unknown as { getChat: ReturnType<typeof vi.fn> }).getChat).not.toHaveBeenCalled();
  });

  it('resolves via Telegram getChat and caches it when no channel chat exists yet', async () => {
    mockListTelegramChats.mockResolvedValueOnce([]);
    const client = fakeClient({ id: -100999, type: 'channel', title: 'Світло Ікони', username: 'svit_ikony' });

    const result = await getOrResolveChannelChat(client, '@svit_ikony');

    expect((client as unknown as { getChat: ReturnType<typeof vi.fn> }).getChat).toHaveBeenCalledWith('@svit_ikony');
    expect(mockUpsertTelegramChat).toHaveBeenCalledWith(
      expect.objectContaining({ telegramChatId: -100999, chatType: 'channel', username: 'svit_ikony' })
    );
    expect(result.telegramChatId).toBe(-100999);
  });
});
