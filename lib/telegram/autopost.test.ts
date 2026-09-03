import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMO_BROADCAST_BUTTON_LABEL, PROMO_BROADCAST_BUTTON_URL, PROMO_BROADCAST_TEXT } from './content-format';

const mockGetAutopostSettings = vi.fn();
const mockClaimAutopostSlot = vi.fn();
/** Defaults to "nothing prepared" so every pre-existing test below keeps
 * exercising the unchanged fresh-generation fallback path; dedicated tests
 * further down override this to exercise the Content Plan Stage 2
 * ready-fast-path instead. */
const mockClaimReadyAutopostSlot = vi.fn<() => Promise<unknown | null>>(async () => null);
const mockSetAutopostDraftText = vi.fn();
const mockSetAutopostImageResult = vi.fn();
const mockSetAutopostVerificationResult = vi.fn();
/** Defaults to "not configured" (null) so every pre-existing test below is
 * unaffected -- promoBroadcastDue is false whenever this resolves null,
 * exactly like a fresh install before migration 0013's seeded row is ever
 * enabled. Dedicated tests further down override this. */
const mockGetPromoBroadcastSettings = vi.fn<() => Promise<{ enabled: boolean; scheduleTime: string } | null>>(async () => null);
const mockClaimPromoBroadcastSlot = vi.fn();

const AUTOPOST_CONTENT_TYPES = ['morning_prayer', 'saint_of_day', 'gospel', 'faith_story', 'evening_prayer'];

vi.mock('@/lib/d1/repositories/telegram-autopost', () => ({
  getAutopostSettings: mockGetAutopostSettings,
  claimAutopostSlot: mockClaimAutopostSlot,
  claimReadyAutopostSlot: mockClaimReadyAutopostSlot,
  setAutopostDraftText: mockSetAutopostDraftText,
  setAutopostImageResult: mockSetAutopostImageResult,
  setAutopostVerificationResult: mockSetAutopostVerificationResult,
  getPromoBroadcastSettings: mockGetPromoBroadcastSettings,
  claimPromoBroadcastSlot: mockClaimPromoBroadcastSlot,
  isAutopostContentType: (value: string) => AUTOPOST_CONTENT_TYPES.includes(value),
}));

const mockMarkTelegramPostSent = vi.fn();
const mockMarkTelegramPostFailed = vi.fn();
const mockRecordDeliveryLog = vi.fn();
const mockSetTelegramPostPhotoMessageId = vi.fn();
const mockSetTelegramPostAudioMessageId = vi.fn();

vi.mock('@/lib/d1/repositories/telegram', () => ({
  markTelegramPostSent: mockMarkTelegramPostSent,
  markTelegramPostFailed: mockMarkTelegramPostFailed,
  recordDeliveryLog: mockRecordDeliveryLog,
  setTelegramPostPhotoMessageId: mockSetTelegramPostPhotoMessageId,
  setTelegramPostAudioMessageId: mockSetTelegramPostAudioMessageId,
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
const mockSendAudio = vi.fn(async () => ({ messageId: 555 }));
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    TelegramClient: vi.fn().mockImplementation(() => ({ sendMessage: mockSendMessage, sendPhoto: mockSendPhoto, sendAudio: mockSendAudio })),
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

  // Task: "Найден production content-quality bug" -- the real incident
  // (saint_of_day, publish_date 2026-09-03, telegram_posts.id=19) went out
  // through exactly this fully-automatic path, with no human review step
  // at all. Proves the language leak is now caught right after generation,
  // never persisted, and never sent.
  it('marks the post failed and never sends when the generated text leaks a foreign-language phrase', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
    mockLoadAutopostFacts.mockResolvedValue({
      status: 'ok',
      facts: { facts: 'Молитва: ...', sourceType: 'prayer', sourceId: 'p1' },
    });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue(
      'Він є одним із сімдесяти апостолів Христових, які spread the Gospel, несучи світло віри в різні куточки світу.',
    );

    const result = await runAutopostTick();

    expect(mockSetAutopostDraftText).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(42, expect.stringContaining('Виявлено текст іншою мовою'));
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'failed' }]);
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

describe('runAutopostTick -- Content Plan Stage 2 ready-slot fast path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    mockGetOrResolveChannelChat.mockResolvedValue({ telegramChatId: -100999 });
    mockGetTelegramConfig.mockResolvedValue({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' });
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockSendMessage.mockResolvedValue({ messageId: 777 });
    mockSendPhoto.mockResolvedValue({ messageId: 777 });
    mockGetAutopostSettings.mockResolvedValue(settingsWith({}));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the stored text/media and skips OpenAI/image generation entirely when a ready row exists', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 900,
      text: 'Вже підготовлений адміністратором текст.',
      mediaUrl: 'https://svetikony.com/media/telegram/900/post-image/x.png',
      audioUrl: null,
      telegramPhotoMessageId: null,
      telegramAudioMessageId: null,
      verificationStatus: null,
    });

    const result = await runAutopostTick();

    expect(mockClaimReadyAutopostSlot).toHaveBeenCalledWith('morning_prayer', CIVIL_DATE_ISO);
    expect(mockLoadAutopostFacts).not.toHaveBeenCalled();
    expect(mockClaimAutopostSlot).not.toHaveBeenCalled();
    expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    expect(mockEnsureAutopostImage).not.toHaveBeenCalled();
    expect(mockSendPhoto).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/900/post-image/x.png', 'Вже підготовлений адміністратором текст.');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(900, 777, null, null);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('sends a manually-assigned audio file for a ready row (audio_then_text), independent of any photo', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 905,
      text: 'Текст із аудіо.',
      mediaUrl: null,
      audioUrl: 'https://svetikony.com/media/telegram/905/post-audio/a.mp3',
      telegramPhotoMessageId: null,
      telegramAudioMessageId: null,
      verificationStatus: null,
    });
    mockSendAudio.mockResolvedValue({ messageId: 951 });
    mockSendMessage.mockResolvedValue({ messageId: 900 });

    const result = await runAutopostTick();

    expect(mockSendAudio).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/905/post-audio/a.mp3', expect.any(String));
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Текст із аудіо.');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(905, 900, null, 951);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('sends both a manually-assigned photo and audio for a ready row (photo_and_audio_then_text) as three independent messages', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 906,
      text: 'Текст із фото і аудіо.',
      mediaUrl: 'https://svetikony.com/media/telegram/906/post-image/x.png',
      audioUrl: 'https://svetikony.com/media/telegram/906/post-audio/a.mp3',
      telegramPhotoMessageId: null,
      telegramAudioMessageId: null,
      verificationStatus: null,
    });
    mockSendPhoto.mockResolvedValue({ messageId: 901 });
    mockSendAudio.mockResolvedValue({ messageId: 951 });
    mockSendMessage.mockResolvedValue({ messageId: 900 });

    const result = await runAutopostTick();

    expect(mockSendPhoto).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/906/post-image/x.png', expect.any(String));
    expect(mockSendAudio).toHaveBeenCalledWith(-100999, 'https://svetikony.com/media/telegram/906/post-audio/a.mp3', expect.any(String));
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Текст із фото і аудіо.');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(906, 900, 901, 951);
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('reuses an already-sent audio message id on a retried ready send, never re-sending it', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 907,
      text: 'Текст.',
      mediaUrl: null,
      audioUrl: 'https://svetikony.com/media/telegram/907/post-audio/a.mp3',
      telegramPhotoMessageId: null,
      telegramAudioMessageId: 951, // audio already sent in a previous attempt
      verificationStatus: null,
    });
    mockSendMessage.mockResolvedValue({ messageId: 900 });

    await runAutopostTick();

    expect(mockSendAudio).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Текст.');
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(907, 900, null, 951);
  });

  it('the full auto-generation path (no admin preparation) never sends audio -- audio is manual-only', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue(null);
    mockLoadAutopostFacts.mockResolvedValue({ status: 'ok', facts: { facts: 'x', sourceType: 'prayer', sourceId: 'p1' } });
    mockClaimAutopostSlot.mockResolvedValue({ id: 43, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Свіжий текст.');

    await runAutopostTick();

    expect(mockSendAudio).not.toHaveBeenCalled();
  });

  it('falls back to existing generation when no ready row exists for the slot', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue(null);
    mockLoadAutopostFacts.mockResolvedValue({ status: 'ok', facts: { facts: 'x', sourceType: 'prayer', sourceId: 'p1' } });
    mockClaimAutopostSlot.mockResolvedValue({ id: 42, status: 'draft' });
    mockGenerateTelegramPost.mockResolvedValue('Свіжий текст.');

    const result = await runAutopostTick();

    expect(mockClaimAutopostSlot).toHaveBeenCalled();
    expect(mockGenerateTelegramPost).toHaveBeenCalled();
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'sent' }]);
  });

  it('re-validates a ready row before sending and marks it failed (not reverted to ready) if validation fails', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 901,
      text: '', // empty text should never happen for a real 'ready' row, but the tick must still defend against it
      mediaUrl: null,
      telegramPhotoMessageId: null,
      verificationStatus: null,
    });

    const result = await runAutopostTick();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(901, expect.stringContaining('Pre-send validation failed'));
    expect(mockMarkTelegramPostSent).not.toHaveBeenCalled();
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'failed' }]);
  });

  it('marks a ready row failed (never reverted to ready) when the Telegram send itself throws', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 902,
      text: 'Текст готовий до відправки.',
      mediaUrl: null,
      telegramPhotoMessageId: null,
      verificationStatus: null,
    });
    mockSendMessage.mockRejectedValueOnce(new Error('Telegram is down'));

    const result = await runAutopostTick();

    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(902, 'Telegram is down');
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith(expect.objectContaining({ telegramPostId: 902, status: 'failed' }));
    expect(result.attempted).toEqual([{ contentType: 'morning_prayer', outcome: 'failed' }]);
  });

  it('respects saint_of_day verification stored on the ready row -- refuses to send if not verified', async () => {
    mockGetAutopostSettings.mockResolvedValue(settingsWith({ items: [{ contentType: 'saint_of_day', enabled: true, scheduleTime: DUE_HHMM }] }));
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 903,
      text: 'Текст про святого.',
      mediaUrl: null,
      telegramPhotoMessageId: null,
      verificationStatus: 'failed', // should never really happen (mark-ready enforces this) -- defense in depth
    });

    const result = await runAutopostTick();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result.attempted).toEqual([{ contentType: 'saint_of_day', outcome: 'failed' }]);
  });

  it('reuses an already-sent photo message id on a retried ready send (photo_then_text long-post continuation)', async () => {
    mockClaimReadyAutopostSlot.mockResolvedValue({
      id: 904,
      text: 'Дуже довгий текст. '.repeat(60),
      mediaUrl: 'https://svetikony.com/media/telegram/904/post-image/x.png',
      audioUrl: null,
      telegramPhotoMessageId: 1234, // photo already sent in a previous attempt
      telegramAudioMessageId: null,
      verificationStatus: null,
    });

    await runAutopostTick();

    expect(mockSendPhoto).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, 'Дуже довгий текст. '.repeat(60));
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(904, 777, 1234, null);
  });
});

describe('runAutopostTick -- daily "visit the site" promo broadcast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    mockGetTelegramConfig.mockResolvedValue({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' });
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockGetOrResolveChannelChat.mockResolvedValue({ telegramChatId: -100999 });
    // No content-type slot due in any of these tests -- isolates the promo
    // broadcast's own behavior from the unrelated 5-type loop.
    mockGetAutopostSettings.mockResolvedValue(settingsWith({ items: [{ contentType: 'morning_prayer', enabled: true, scheduleTime: NOT_DUE_HHMM }] }));
    mockSendMessage.mockResolvedValue({ messageId: 900 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not sent when disabled, even if its schedule time is due', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: false, scheduleTime: DUE_HHMM });

    const result = await runAutopostTick();

    expect(mockClaimPromoBroadcastSlot).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result.promoBroadcast).toBeUndefined();
  });

  it('is not sent when enabled but not due yet', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: true, scheduleTime: NOT_DUE_HHMM });

    const result = await runAutopostTick();

    expect(mockClaimPromoBroadcastSlot).not.toHaveBeenCalled();
    expect(result.promoBroadcast).toBeUndefined();
  });

  it('is processed even when it is the ONLY thing due (no content-type slot due this tick)', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: true, scheduleTime: DUE_HHMM });
    mockClaimPromoBroadcastSlot.mockResolvedValue({ id: 500 });

    const result = await runAutopostTick();

    expect(result.attempted).toEqual([]); // no content-type slot was due
    expect(result.promoBroadcast).toEqual({ outcome: 'sent' });
  });

  it('sends the fixed text with a URL button linking to the site, and marks the claimed row sent', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: true, scheduleTime: DUE_HHMM });
    mockClaimPromoBroadcastSlot.mockResolvedValue({ id: 500 });

    await runAutopostTick();

    expect(mockClaimPromoBroadcastSlot).toHaveBeenCalledWith(-100999, CIVIL_DATE_ISO, PROMO_BROADCAST_TEXT);
    expect(mockSendMessage).toHaveBeenCalledWith(-100999, PROMO_BROADCAST_TEXT, {
      inline_keyboard: [[{ text: PROMO_BROADCAST_BUTTON_LABEL, url: PROMO_BROADCAST_BUTTON_URL }]],
    });
    expect(mockMarkTelegramPostSent).toHaveBeenCalledWith(500, 900);
    expect(mockRecordDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ telegramPostId: 500, status: 'success', telegramMessageId: 900 }),
    );
  });

  it('does not send twice when the slot is already claimed by an earlier tick this window', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: true, scheduleTime: DUE_HHMM });
    mockClaimPromoBroadcastSlot.mockResolvedValue(null); // already claimed

    const result = await runAutopostTick();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockMarkTelegramPostSent).not.toHaveBeenCalled();
    expect(result.promoBroadcast).toBeUndefined();
  });

  it('marks the claimed row failed (never auto-retried within the window) when the Telegram send itself throws', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: true, scheduleTime: DUE_HHMM });
    mockClaimPromoBroadcastSlot.mockResolvedValue({ id: 501 });
    mockSendMessage.mockRejectedValueOnce(new Error('Telegram is down'));

    const result = await runAutopostTick();

    expect(mockMarkTelegramPostFailed).toHaveBeenCalledWith(501, 'Telegram is down');
    expect(mockMarkTelegramPostSent).not.toHaveBeenCalled();
    expect(result.promoBroadcast).toEqual({ outcome: 'failed' });
  });

  it('never touches the unrelated 5-type content loop -- attempted stays empty regardless of promo broadcast outcome', async () => {
    mockGetPromoBroadcastSettings.mockResolvedValue({ enabled: true, scheduleTime: DUE_HHMM });
    mockClaimPromoBroadcastSlot.mockResolvedValue({ id: 502 });

    const result = await runAutopostTick();

    expect(mockClaimAutopostSlot).not.toHaveBeenCalled();
    expect(mockClaimReadyAutopostSlot).not.toHaveBeenCalled();
    expect(result.attempted).toEqual([]);
  });
});
