import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAutopostSettings = vi.fn();
const mockClaimAutopostSlot = vi.fn();
const mockSetAutopostDraftText = vi.fn();
const mockSetAutopostImageResult = vi.fn();
const mockSetAutopostVerificationResult = vi.fn();

const AUTOPOST_CONTENT_TYPES = ['morning_prayer', 'saint_of_day', 'gospel', 'faith_story', 'evening_prayer'];

vi.mock('@/lib/d1/repositories/telegram-autopost', () => ({
  getAutopostSettings: mockGetAutopostSettings,
  claimAutopostSlot: mockClaimAutopostSlot,
  setAutopostDraftText: mockSetAutopostDraftText,
  setAutopostImageResult: mockSetAutopostImageResult,
  setAutopostVerificationResult: mockSetAutopostVerificationResult,
  isAutopostContentType: (value: string) => AUTOPOST_CONTENT_TYPES.includes(value),
}));

const mockMarkTelegramPostSent = vi.fn();
const mockMarkTelegramPostFailed = vi.fn();
const mockRecordDeliveryLog = vi.fn();
const mockSetTelegramPostPhotoMessageId = vi.fn();

vi.mock('@/lib/d1/repositories/telegram', () => ({
  markTelegramPostSent: mockMarkTelegramPostSent,
  markTelegramPostFailed: mockMarkTelegramPostFailed,
  recordDeliveryLog: mockRecordDeliveryLog,
  setTelegramPostPhotoMessageId: mockSetTelegramPostPhotoMessageId,
}));

const mockGenerateTelegramPost = vi.fn();
vi.mock('@/lib/ai/openai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/openai')>('@/lib/ai/openai');
  return { ...actual, generateTelegramPost: mockGenerateTelegramPost };
});

const mockLoadAutopostFacts = vi.fn();
vi.mock('./autopost-content', () => ({ loadAutopostFacts: mockLoadAutopostFacts }));

/** Defaults to "no image" so every pre-existing text-only assertion below
 * keeps using sendMessage without having to know about the image step;
 * dedicated tests further down override this per-case. */
const mockEnsureAutopostImage = vi.fn<() => Promise<string | null>>(async () => null);
vi.mock('./autopost-image', () => ({ ensureAutopostImage: mockEnsureAutopostImage }));

const mockGetOrResolveChannelChat = vi.fn(async () => ({ telegramChatId: -100999 }));
vi.mock('./channel', () => ({ getOrResolveChannelChat: mockGetOrResolveChannelChat }));

const mockSendMessage = vi.fn(async () => ({ messageId: 555 }));
const mockSendPhoto = vi.fn(async () => ({ messageId: 555 }));
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    TelegramClient: vi.fn().mockImplementation(() => ({ sendMessage: mockSendMessage, sendPhoto: mockSendPhoto })),
  };
});

const mockGetTelegramConfig = vi.fn<() => Promise<{ botToken: string; webhookSecret: string | null; channel: string } | null>>(
  async () => ({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' }),
);
const mockGetOpenAiConfig = vi.fn<() => Promise<{ apiKey: string; model?: string; imageModel?: string } | null>>(async () => ({
  apiKey: 'fake-openai-key',
  model: undefined,
  imageModel: undefined,
}));
vi.mock('./env', () => ({
  getTelegramConfig: mockGetTelegramConfig,
  getOpenAiConfig: mockGetOpenAiConfig,
}));

const { runAutopostTick } = await import('./autopost');

/** Every assertion below derives the "due" schedule time from the same
 * Intl computation the source uses, rather than hardcoding a Kyiv wall-clock
 * time and hoping it matches — see autopost.ts's kyivHhMm(). Civil
 * 2026-08-30 (Europe/Kyiv) is Julian 2026-08-17 (13-day gap) -- see
 * julian-calendar.test.ts for how that conversion itself is verified. */
const FIXED_NOW = new Date('2026-08-30T04:02:00.000Z');
const CIVIL_DATE_ISO = '2026-08-30';
const JULIAN_DATE_ISO = '2026-08-17';
function kyivHhMmOffset(date: Date, offsetMinutes: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(date.getTime() + offsetMinutes * 60_000),
  );
}
const DUE_HHMM = kyivHhMmOffset(FIXED_NOW, 0);
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
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockSendMessage.mockResolvedValue({ messageId: 555 });
    mockSendPhoto.mockResolvedValue({ messageId: 555 });
    mockEnsureAutopostImage.mockResolvedValue(null);
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

  it('still treats a slot as due after a missed tick, within the cron-jitter tolerance window', async () => {
    // Schedule time 10 minutes in the past: two 5-minute cron cycles have
    // gone by (one on-time fire that presumably failed/never landed, one
    // retry), and the slot must still be caught rather than lost for the
    // day -- see autopost.ts's DUE_WINDOW_MINUTES comment.
    const laggedHhMm = kyivHhMmOffset(FIXED_NOW, -10);
    mockGetAutopostSettings.mockResolvedValue(
      settingsWith({ items: [{ contentType: 'morning_prayer', enabled: true, scheduleTime: laggedHhMm }] }),
    );
    mockLoadAutopostFacts.mockResolvedValue({ status: 'insufficient_data' });

    const result = await runAutopostTick();

    expect(mockLoadAutopostFacts).toHaveBeenCalledWith('morning_prayer', JULIAN_DATE_ISO);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'skipped_insufficient_data' }]);
  });

  it('stops treating a slot as due once the tolerance window has fully elapsed (does not reach back into a missed day)', async () => {
    const tooLateHhMm = kyivHhMmOffset(FIXED_NOW, -15);
    mockGetAutopostSettings.mockResolvedValue(
      settingsWith({ items: [{ contentType: 'morning_prayer', enabled: true, scheduleTime: tooLateHhMm }] }),
    );

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([]);
    expect(mockLoadAutopostFacts).not.toHaveBeenCalled();
  });

  it('looks up source facts by the Julian (old-style) date, not the civil Europe/Kyiv date', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ status: 'insufficient_data' });

    await runAutopostTick();

    expect(mockLoadAutopostFacts).toHaveBeenCalledWith('morning_prayer', JULIAN_DATE_ISO);
    expect(mockLoadAutopostFacts).not.toHaveBeenCalledWith('morning_prayer', CIVIL_DATE_ISO);
  });

  it('skips without calling OpenAI when there is no calendar day at all for the Julian date', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ status: 'missing_source' });

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'skipped_missing_source' }]);
    expect(mockClaimAutopostSlot).not.toHaveBeenCalled();
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
  });

  it('skips without claiming when the calendar day exists but this content type has no matching row', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({ status: 'insufficient_data' });

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'skipped_insufficient_data' }]);
    expect(mockClaimAutopostSlot).not.toHaveBeenCalled();
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
  });

  it('claims under the civil Europe/Kyiv publish_date even though facts were looked up by the Julian date', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'some facts', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue(null);

    await runAutopostTick();

    expect(mockClaimAutopostSlot).toHaveBeenCalledWith(expect.objectContaining({ publishDate: CIVIL_DATE_ISO }));
  });

  it('skips without calling OpenAI/Telegram when the slot was already claimed', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'some facts', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue(null);

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'skipped_already_claimed' }]);
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('generates, saves the draft text, publishes, and marks sent on success', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Доброго ранку! 🙏');

    const result = await runAutopostTick();

    expect(mockGenerateTelegramPost).toHaveBeenCalledWith(
      expect.objectContaining({
        contentTypeLabel: 'Ранкова молитва',
        formatHint: expect.stringContaining('Ранкова молитва'),
        facts: 'Молитва: ...',
        civilDateIso: CIVIL_DATE_ISO,
        julianDateIso: JULIAN_DATE_ISO,
      }),
    );
    expect(mockSetAutopostDraftText).toHaveBeenCalledWith(42, 'Доброго ранку! 🙏');
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Доброго ранку! 🙏');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(42, 555, null);
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ telegramPostId: 42, status: 'success', telegramMessageId: 555 }),
    );
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('sends a photo (not sendMessage) when image generation succeeds, with the generated text as caption', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Доброго ранку! 🙏');
    mockEnsureAutopostImage.mockResolvedValue('https://svetikony.com/media/telegram/42/post-image/abc.png');

    const result = await runAutopostTick();

    expect(mockEnsureAutopostImage).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 42, existingMediaUrl: null, contentType: 'morning_prayer', apiKey: 'fake-openai-key' }),
    );
    expect(mockSendPhoto).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/42/post-image/abc.png', 'Доброго ранку! 🙏');
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(42, 555, null);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('falls back to sendMessage (text-only) when image generation fails, and still marks the post sent', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Доброго ранку! 🙏');
    mockEnsureAutopostImage.mockResolvedValue(null); // ensureAutopostImage itself never throws -- see autopost-image.test.ts

    const result = await runAutopostTick();

    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Доброго ранку! 🙏');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(42, 555, null);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('long post: sends a photo-only message then the full text as a separate message, one claim, both ids recorded', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    const longText = 'а'.repeat(1500); // exceeds SAFE_CAPTION_LIMIT (1000)
    mockGenerateTelegramPost.mockResolvedValue(longText);
    mockEnsureAutopostImage.mockResolvedValue('https://svetikony.com/media/telegram/42/post-image/abc.png');
    mockSendPhoto.mockResolvedValueOnce({ messageId: 777 });
    mockSendMessage.mockResolvedValueOnce({ messageId: 888 });

    const result = await runAutopostTick();

    // Exactly one claim -- duplicate protection is unaffected by needing
    // two real Telegram calls for one logical post.
    expect(mockClaimAutopostSlot).toHaveBeenCalledTimes(1);
    expect(mockSendPhoto).toHaveBeenCalledWith(
      -100999,
      'https://svetikony.com/media/telegram/42/post-image/abc.png',
      '☀️ Ранкова молитва\n🙏 Продовження — у наступному повідомленні.', // fixed linked caption, not the full text
    );
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, longText); // full, untruncated text, unchanged
    expect(mockSetTelegramPostPhotoMessageId).toHaveBeenCalledWith(42, 777);
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(42, 888, 777);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('still saves the generated text and marks failed when the Telegram send throws', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
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
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockRejectedValueOnce(new Error('OpenAI request failed (HTTP 500)'));

    const result = await runAutopostTick();

    expect(mockSetAutopostDraftText).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(42, 'OpenAI request failed (HTTP 500)');
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'failed' }]);
  });

  it('claims a distinct slot per content type at the same due time (duplicate protection still per-type)', async () => {
    mockGetAutopostSettings.mockResolvedValue(
      settingsWith({
        items: [
          { contentType: 'morning_prayer', enabled: true, scheduleTime: DUE_HHMM },
          { contentType: 'saint_of_day', enabled: true, scheduleTime: DUE_HHMM },
        ],
      }),
    );
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'facts', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValueOnce({ id: 1, status: 'draft' }).mockResolvedValueOnce(null);
    mockGenerateTelegramPost.mockResolvedValue('text');

    const result = await runAutopostTick();

    expect(mockClaimAutopostSlot).toHaveBeenCalledTimes(2);
    expect(result.attempted).toEqual([
      { contentType: 'morning_prayer', outcome: 'sent' },
      { contentType: 'saint_of_day', outcome: 'skipped_already_claimed' },
    ]);
  });
});

/** Mandatory pre-publish calendar verification (saint_of_day only) -- uses
 * the REAL lib/telegram/orthodox-calendar-verifier.ts (not mocked), whose
 * only curated entry is old-style '08-18'. Civil 2026-08-31 (Europe/Kyiv)
 * is Julian 2026-08-18 -- see julian-calendar.test.ts. */
describe('runAutopostTick -- mandatory calendar verification for saint_of_day', () => {
  const VERIFICATION_FIXED_NOW = new Date('2026-08-31T04:02:00.000Z');
  const VERIFICATION_CIVIL_DATE_ISO = '2026-08-31';
  const VERIFICATION_DUE_HHMM = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(VERIFICATION_FIXED_NOW);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(VERIFICATION_FIXED_NOW);
    vi.clearAllMocks();
    mockGetOrResolveChannelChat.mockResolvedValue({ telegramChatId: -100999 });
    mockGetTelegramConfig.mockResolvedValue({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' });
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockSendMessage.mockResolvedValue({ messageId: 555 });
    mockSendPhoto.mockResolvedValue({ messageId: 555 });
    mockEnsureAutopostImage.mockResolvedValue(null);
    mockGetAutopostSettings.mockResolvedValue({
      globalEnabled: true,
      items: [{ contentType: 'saint_of_day', enabled: true, scheduleTime: VERIFICATION_DUE_HHMM }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('VERIFICATION_FAILED: D1 offers a saint (Cyprian of Carthage) that does not match the two-source consensus (Florus and Laurus) for old-style Aug 18 -- OpenAI/Image/Telegram are never called', async () => {
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: {
        facts: 'Церковний календар (старий стиль): Священномученик Кипріан...',
        sourceType: 'saint',
        sourceId: 'cyprian-id',
        candidateName: 'Священномученик Кипріан, єпископ Карфагенський',
      },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 100, status: 'draft' });

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'saint_of_day', outcome: 'skipped_verification_failed' }]);
    expect(mockSetAutopostVerificationResult).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ status: 'failed', error: 'candidate_name_mismatch' }),
    );
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(100, expect.stringContaining('candidate_name_mismatch'));
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockEnsureAutopostImage).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendPhoto).not.toHaveBeenCalled();
  });

  it('VERIFIED: D1 offers the saint (Florus and Laurus) that two independent sources confirm for old-style Aug 18 -- pipeline proceeds to OpenAI/Telegram', async () => {
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: {
        facts: 'Церковний календар (старий стиль): Мученики Флор і Лавр...',
        sourceType: 'saint',
        sourceId: 'florus-laurus-id',
        candidateName: 'Мученики Флор і Лавр',
      },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 101, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('🌟 Сьогодні Церква вшановує мучеників Флора і Лавра...');

    const result = await runAutopostTick();

    expect(mockSetAutopostVerificationResult).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ status: 'verified', error: null }),
    );
    expect(mockGenerateTelegramPost).toHaveBeenCalledWith(expect.objectContaining({ verifiedFacts: true }));
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, '🌟 Сьогодні Церква вшановує мучеників Флора і Лавра...');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(101, 555, null);
    expect(result.attempted).toEqual([{ contentType: 'saint_of_day', outcome: 'sent' }]);
  });

  it('fails closed (skipped_verification_failed) when there is no reference data for the Julian date at all', async () => {
    vi.setSystemTime(new Date('2026-01-05T04:02:00.000Z')); // civil date with no curated reference entry
    const dueHhMm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false }).format(
      new Date('2026-01-05T04:02:00.000Z'),
    );
    mockGetAutopostSettings.mockResolvedValue({
      globalEnabled: true,
      items: [{ contentType: 'saint_of_day', enabled: true, scheduleTime: dueHhMm }],
    });
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'some facts', sourceType: 'saint', sourceId: 'any-id', candidateName: 'Будь-який святий' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 102, status: 'draft' });

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([{ contentType: 'saint_of_day', outcome: 'skipped_verification_failed' }]);
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
  });
});
