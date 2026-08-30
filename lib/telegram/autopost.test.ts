import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAutopostSettings = vi.fn();
const mockClaimAutopostSlot = vi.fn();
const mockSetAutopostDraftText = vi.fn();

vi.mock('@/lib/d1/repositories/telegram-autopost', () => ({
  getAutopostSettings: mockGetAutopostSettings,
  claimAutopostSlot: mockClaimAutopostSlot,
  setAutopostDraftText: mockSetAutopostDraftText,
}));

const mockMarkTelegramPostSent = vi.fn();
const mockMarkTelegramPostFailed = vi.fn();
const mockRecordDeliveryLog = vi.fn();

vi.mock('@/lib/d1/repositories/telegram', () => ({
  markTelegramPostSent: mockMarkTelegramPostSent,
  markTelegramPostFailed: mockMarkTelegramPostFailed,
  recordDeliveryLog: mockRecordDeliveryLog,
}));

const mockGenerateTelegramPost = vi.fn();
vi.mock('@/lib/ai/openai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/openai')>('@/lib/ai/openai');
  return { ...actual, generateTelegramPost: mockGenerateTelegramPost };
});

const mockLoadAutopostFacts = vi.fn();
vi.mock('./autopost-content', () => ({ loadAutopostFacts: mockLoadAutopostFacts }));

const mockGetOrResolveChannelChat = vi.fn(async () => ({ telegramChatId: -100999 }));
vi.mock('./channel', () => ({ getOrResolveChannelChat: mockGetOrResolveChannelChat }));

const mockSendMessage = vi.fn(async () => ({ messageId: 555 }));
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    TelegramClient: vi.fn().mockImplementation(() => ({ sendMessage: mockSendMessage })),
  };
});

const mockGetTelegramConfig = vi.fn<() => Promise<{ botToken: string; webhookSecret: string | null; channel: string } | null>>(
  async () => ({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' }),
);
const mockGetOpenAiConfig = vi.fn<() => Promise<{ apiKey: string; model?: string } | null>>(async () => ({
  apiKey: 'fake-openai-key',
  model: undefined,
}));
vi.mock('./env', () => ({
  getTelegramConfig: mockGetTelegramConfig,
  getOpenAiConfig: mockGetOpenAiConfig,
}));

const { runAutopostTick } = await import('./autopost');

/** Every assertion below derives the "due" schedule time from the same
 * Intl computation the source uses, rather than hardcoding a Kyiv wall-clock
 * time and hoping it matches — see autopost.ts's kyivHhMm(). */
const FIXED_NOW = new Date('2026-08-30T04:02:00.000Z');
const DUE_HHMM = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Kyiv',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(FIXED_NOW);
const NOT_DUE_HHMM = '23:45';

function settingsWith(overrides: { globalEnabled?: boolean; items?: { contentType: string; enabled: boolean; scheduleTime: string }[] }) {
  return {
    globalEnabled: overrides.globalEnabled ?? true,
    items: overrides.items ?? [{ contentType: 'morning_prayer', enabled: true, scheduleTime: DUE_HHMM }],
  };
}

describe('runAutopostTick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    mockGetOrResolveChannelChat.mockResolvedValue({ telegramChatId: -100999 });
    mockGetTelegramConfig.mockResolvedValue({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' });
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined });
    mockSendMessage.mockResolvedValue({ messageId: 555 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when autopost is globally disabled', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({ globalEnabled: false }));

    const result = await runAutopostTick();

    expect(result).toEqual({ ranAt: FIXED_NOW.toISOString(), globalEnabled: false, attempted: [] });
    expect(mockLoadAutopostFacts).not.toHaveBeenCalled();
    expect(mockGetOrResolveChannelChat).not.toHaveBeenCalled();
  });

  it('does nothing when global is on but Telegram or OpenAI isn\'t configured', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockGetTelegramConfig.mockResolvedValue(null);

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([]);
    expect(result.globalEnabled).toBe(true);
    expect(mockLoadAutopostFacts).not.toHaveBeenCalled();
  });

  it('skips a content type whose schedule time is not due yet', async () => {
    mockGetAutopostSettings.mockResolvedValue(
      settingsWith({ items: [{ contentType: 'morning_prayer', enabled: true, scheduleTime: NOT_DUE_HHMM }] }),
    );

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([]);
    expect(mockLoadAutopostFacts).not.toHaveBeenCalled();
  });

  it('skips a disabled content type even if its time is due', async () => {
    mockGetAutopostSettings.mockResolvedValue(
      settingsWith({ items: [{ contentType: 'morning_prayer', enabled: false, scheduleTime: DUE_HHMM }] }),
    );

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([]);
  });

  it('skips without claiming when there is not enough real data', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue(null);

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'skipped_insufficient_data' }]);
    expect(mockClaimAutopostSlot).not.toHaveBeenCalled();
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
  });

  it('skips without calling OpenAI/Telegram when the slot was already claimed', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ facts: 'some facts', sourceType: 'prayer', sourceId: 'p1' });
    mockClaimAutopostSlot.mockResolvedValue(null);

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'skipped_already_claimed' }]);
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('generates, saves the draft text, publishes, and marks sent on success', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Доброго ранку! 🙏');

    const result = await runAutopostTick();

    expect(mockSetAutopostDraftText).toHaveBeenCalledWith(42, 'Доброго ранку! 🙏');
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Доброго ранку! 🙏');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(42, 555);
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ telegramPostId: 42, status: 'success', telegramMessageId: 555 }),
    );
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('still saves the generated text and marks failed when the Telegram send throws', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Доброго ранку! 🙏');
    mockSendMessage.mockRejectedValueOnce(new Error('bot was kicked from the channel'));

    const result = await runAutopostTick();

    expect(mockSetAutopostDraftText).toHaveBeenCalledWith(42, 'Доброго ранку! 🙏');
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(42, 'bot was kicked from the channel');
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ telegramPostId: 42, status: 'failed', errorMessage: 'bot was kicked from the channel' }),
    );
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'failed' }]);
  });

  it('marks failed (never invents a post) when OpenAI itself fails', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockRejectedValueOnce(new Error('OpenAI request failed (HTTP 500)'));

    const result = await runAutopostTick();

    expect(mockSetAutopostDraftText).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(42, 'OpenAI request failed (HTTP 500)');
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'failed' }]);
  });
});
