import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTelegramPost = vi.fn();
vi.mock('@/lib/d1/repositories/telegram', () => ({ getTelegramPost: mockGetTelegramPost }));

const mockFindOrCreatePreparedSlot = vi.fn();
const mockFindTelegramPostBySlot = vi.fn();
const mockSetAutopostImageResult = vi.fn();
const mockSetAutopostAudioResult = vi.fn();
const mockSetAutopostSlotReady = vi.fn();
const mockSetAutopostSlotUnready = vi.fn();
const mockSetAutopostVerificationResult = vi.fn();
const mockSetPreparedPostText = vi.fn();
vi.mock('@/lib/d1/repositories/telegram-autopost', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/d1/repositories/telegram-autopost')>('@/lib/d1/repositories/telegram-autopost');
  return {
    ...actual,
    findOrCreatePreparedSlot: mockFindOrCreatePreparedSlot,
    findTelegramPostBySlot: mockFindTelegramPostBySlot,
    setAutopostImageResult: mockSetAutopostImageResult,
    setAutopostAudioResult: mockSetAutopostAudioResult,
    setAutopostSlotReady: mockSetAutopostSlotReady,
    setAutopostSlotUnready: mockSetAutopostSlotUnready,
    setAutopostVerificationResult: mockSetAutopostVerificationResult,
    setPreparedPostText: mockSetPreparedPostText,
  };
});

const mockValidateTelegramMediaAsset = vi.fn(async () => {});
vi.mock('./media-limits', () => ({ validateTelegramMediaAsset: mockValidateTelegramMediaAsset }));

const mockLoadAutopostFacts = vi.fn();
vi.mock('./autopost-content', () => ({ loadAutopostFacts: mockLoadAutopostFacts }));

const mockEnsureAutopostImage = vi.fn();
vi.mock('./autopost-image', () => ({ ensureAutopostImage: mockEnsureAutopostImage }));

const mockGetOrResolveChannelChat = vi.fn(async () => ({ telegramChatId: -100999 }));
vi.mock('./channel', () => ({ getOrResolveChannelChat: mockGetOrResolveChannelChat }));

vi.mock('./client', () => ({ TelegramClient: vi.fn().mockImplementation(() => ({})) }));

const mockGenerateTelegramPost = vi.fn();
vi.mock('@/lib/ai/openai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/openai')>('@/lib/ai/openai');
  return { ...actual, generateTelegramPost: mockGenerateTelegramPost };
});

const mockGetOpenAiConfig = vi.fn(async () => ({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined }));
const mockGetTelegramConfig = vi.fn(async () => ({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' }));
vi.mock('./env', () => ({ getOpenAiConfig: mockGetOpenAiConfig, getTelegramConfig: mockGetTelegramConfig }));

const {
  assignSlotAudio,
  assignSlotImage,
  editSlotText,
  generateSlotImage,
  generateSlotText,
  markSlotReady,
  markSlotUnready,
  prepareContentPlanDay,
  regenerateSlotImage,
  regenerateSlotText,
  removeSlotAudio,
  removeSlotImage,
} = await import('./content-plan-actions');

/** Real orthodox-calendar-sources.ts / orthodox-calendar-verifier.ts are
 * used unmocked throughout (same convention as autopost.test.ts) -- civil
 * 2026-08-31 is Julian 2026-08-18, which genuinely two-source-verifies as
 * "Флор і Лавр"; civil 2026-01-01 (Julian 2025-12-19) has no entry at all,
 * so it deterministically fails verification (REVIEW_REQUIRED). */
const VERIFIED_CIVIL_DATE = '2026-08-31';
const UNVERIFIED_CIVIL_DATE = '2026-01-01';
const PLAIN_CIVIL_DATE = '2026-08-30'; // no verification required for non-saint types

function draftPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    telegramChatId: -100999,
    sourceType: 'prayer',
    sourceId: 'p1',
    text: null,
    mediaUrl: null,
    telegramMessageId: null,
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    errorMessage: null,
    contentType: 'morning_prayer',
    publishDate: PLAIN_CIVIL_DATE,
    imageError: null,
    verificationStatus: null,
    verificationCheckedAt: null,
    verificationSources: null,
    verificationError: null,
    telegramPhotoMessageId: null,
    audioUrl: null,
    telegramAudioMessageId: null,
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
    ...overrides,
  };
}

const OK_FACTS = { status: 'ok', facts: { facts: 'факти', sourceType: 'prayer', sourceId: 'p1' } };

/** ApiError's own `.message` is always one of a handful of fixed generic
 * strings ("Validation failed", "Conflict", ...) -- the specific reason
 * this codebase actually cares about lives in `.details` (see
 * lib/d1/errors.ts). */
async function expectRejectionDetails(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toMatchObject({ details: expect.stringMatching(pattern) });
}

describe('content-plan-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrResolveChannelChat.mockResolvedValue({ telegramChatId: -100999 });
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockGetTelegramConfig.mockResolvedValue({ botToken: 'fake', webhookSecret: null, channel: '@svit_ikony' });
    mockSetPreparedPostText.mockImplementation(async (id: number, text: string) => draftPost({ id, text, status: 'draft' }));
    mockSetAutopostImageResult.mockImplementation(async (id: number, mediaUrl: string | null, imageError: string | null) =>
      draftPost({ id, mediaUrl, imageError }),
    );
    mockSetAutopostAudioResult.mockImplementation(async (id: number, audioUrl: string | null) => draftPost({ id, audioUrl }));
    mockValidateTelegramMediaAsset.mockResolvedValue(undefined);
  });

  describe('generateSlotText', () => {
    it('rejects when the source is missing entirely (MISSING_SOURCE)', async () => {
      mockLoadAutopostFacts.mockResolvedValue({ status: 'missing_source' });
      await expectRejectionDetails(generateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /MISSING_SOURCE/);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockFindOrCreatePreparedSlot).not.toHaveBeenCalled();
    });

    it('rejects when the calendar day exists but this type has no matching row (insufficient_data -> MISSING_SOURCE)', async () => {
      mockLoadAutopostFacts.mockResolvedValue({ status: 'insufficient_data' });
      await expectRejectionDetails(generateSlotText(PLAIN_CIVIL_DATE, 'gospel'), /MISSING_SOURCE/);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    });

    it('rejects a saint_of_day slot whose candidate does not two-source-verify (REVIEW_REQUIRED), never calls OpenAI', async () => {
      mockLoadAutopostFacts.mockResolvedValue({
        status: 'ok',
        facts: { facts: 'факти', sourceType: 'saint', sourceId: 's1', candidateName: 'Невідомий святий' },
      });
      await expectRejectionDetails(generateSlotText(UNVERIFIED_CIVIL_DATE, 'saint_of_day'), /REVIEW_REQUIRED/);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockFindOrCreatePreparedSlot).not.toHaveBeenCalled();
    });

    it('requires verification success for saint_of_day before generating, and persists the verified result', async () => {
      mockLoadAutopostFacts.mockResolvedValue({
        status: 'ok',
        facts: { facts: 'факти про Флора і Лавра', sourceType: 'saint', sourceId: 's1', candidateName: 'Флор і Лавр' },
      });
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 7, contentType: 'saint_of_day' }));
      mockGenerateTelegramPost.mockResolvedValue('Текст про святих.');

      await generateSlotText(VERIFIED_CIVIL_DATE, 'saint_of_day');

      expect(mockSetAutopostVerificationResult).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'verified' }));
      // Title now leads with the canonical civil+Julian date heading (task:
      // "Исправь date presentation во всём Telegram church content") --
      // 2026-08-31 civil is 2026-08-18 Julian.
      expect(mockGenerateTelegramPost).toHaveBeenCalledWith(
        expect.objectContaining({ verifiedFacts: true, titleLine: '☦️ 31 серпня (18 серпня за юліанським календарем) — Флор і Лавр' }),
      );
    });

    it('never calls Telegram -- content-plan-actions.ts has no Telegram-sending import at all', () => {
      const source = readFileSync(join(__dirname, 'content-plan-actions.ts'), 'utf8');
      expect(source).not.toMatch(/sendAutopostMessage|client\.sendMessage|client\.sendPhoto/);
    });

    it('creates a draft row and persists the generated text on success', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));
      mockGenerateTelegramPost.mockResolvedValue('Ранкова молитва.');

      const result = await generateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(mockFindOrCreatePreparedSlot).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'morning_prayer', publishDate: PLAIN_CIVIL_DATE, channelChatId: -100999 }),
      );
      expect(mockSetPreparedPostText).toHaveBeenCalledWith(5, 'Ранкова молитва.');
      expect(result.text).toBe('Ранкова молитва.');
    });

    // Task: "Найден production content-quality bug" -- the real incident
    // (telegram_posts.id=19) never went through this generation-time gate;
    // this proves a language leak is now caught here, before the row is
    // ever touched at all.
    it('rejects and never persists when the generated text leaks a foreign-language phrase', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));
      mockGenerateTelegramPost.mockResolvedValue(
        'Він є одним із сімдесяти апостолів Христових, які spread the Gospel, несучи світло віри в різні куточки світу.',
      );

      await expectRejectionDetails(generateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /Виявлено текст іншою мовою/);
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
    });

    it('refuses to overwrite text that already exists -- use regenerate instead', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, text: 'Вже є текст' }));

      await expectRejectionDetails(generateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /already has text/);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
    });

    it('rejects a sent slot immediately -- SENT rows are immutable', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sent', text: 'Опубліковано' }));

      await expectRejectionDetails(generateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    });

    it('rejects a sending slot (mid-flight autopost) -- also immutable', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sending' }));

      await expectRejectionDetails(generateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);
    });
  });

  describe('regenerateSlotText', () => {
    it('overwrites existing text without the "already has text" guard', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, text: 'Старий текст' }));
      mockGenerateTelegramPost.mockResolvedValue('Новий текст.');

      const result = await regenerateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(mockSetPreparedPostText).toHaveBeenCalledWith(5, 'Новий текст.');
      expect(result.text).toBe('Новий текст.');
    });

    it('rejects and never persists a regenerated text that leaks a foreign-language phrase, leaving the old text untouched', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, text: 'Старий текст' }));
      mockGenerateTelegramPost.mockResolvedValue('Ми молимося разом, have a blessed day, амінь.');

      await expectRejectionDetails(regenerateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /Виявлено текст іншою мовою/);
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
    });

    it('demotes an already-ready slot back to draft (setPreparedPostText"s own behavior)', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'ready', text: 'Підтверджений текст' }));
      mockGenerateTelegramPost.mockResolvedValue('Новий текст після регенерації.');

      const result = await regenerateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(result.status).toBe('draft');
    });

    it('never regenerates a sent slot', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sent', text: 'Опубліковано' }));

      await expectRejectionDetails(regenerateSlotText(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
    });
  });

  describe('editSlotText', () => {
    it('persists manually-supplied text without ever calling OpenAI', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));

      await editSlotText(PLAIN_CIVIL_DATE, 'morning_prayer', 'Текст написаний вручну.');

      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockSetPreparedPostText).toHaveBeenCalledWith(5, 'Текст написаний вручну.');
    });

    it('creates the row if none exists yet -- manual save is one of the explicit row-creating actions', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 9 }));

      await editSlotText(PLAIN_CIVIL_DATE, 'morning_prayer', 'Новий чернетковий текст.');

      expect(mockFindOrCreatePreparedSlot).toHaveBeenCalled();
    });

    it('rejects editing a sent slot', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sent' }));

      await expectRejectionDetails(editSlotText(PLAIN_CIVIL_DATE, 'morning_prayer', 'спроба редагування'), /already been sent/);
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
    });
  });

  describe('generateSlotImage / regenerateSlotImage', () => {
    it('generateSlotImage refuses to overwrite an existing image', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, mediaUrl: 'https://x/existing.png' }));

      await expectRejectionDetails(generateSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer'), /already has an image/);
      expect(mockEnsureAutopostImage).not.toHaveBeenCalled();
    });

    it('generateSlotImage passes verifiedImageUrl through unchanged, preserving the existing priority order', async () => {
      mockLoadAutopostFacts.mockResolvedValue({
        status: 'ok',
        facts: { facts: 'x', sourceType: 'saint', sourceId: 's1', candidateName: 'Флор і Лавр', verifiedImageUrl: 'https://x/icon.png' },
      });
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, contentType: 'saint_of_day' }));
      mockEnsureAutopostImage.mockResolvedValue('https://x/icon.png');
      mockGetTelegramPost.mockResolvedValue(draftPost({ id: 5, mediaUrl: 'https://x/icon.png' }));

      await generateSlotImage(VERIFIED_CIVIL_DATE, 'saint_of_day');

      expect(mockEnsureAutopostImage).toHaveBeenCalledWith(expect.objectContaining({ verifiedImageUrl: 'https://x/icon.png', existingMediaUrl: null }));
    });

    it('regenerateSlotImage saves the new media_url on success', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, mediaUrl: 'https://x/old.png' }));
      mockEnsureAutopostImage.mockResolvedValue('https://x/new.png');
      mockGetTelegramPost.mockResolvedValue(draftPost({ id: 5, mediaUrl: 'https://x/new.png' }));

      const result = await regenerateSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(result.mediaUrl).toBe('https://x/new.png');
      expect(mockSetAutopostImageResult).not.toHaveBeenCalled(); // ensureAutopostImage already persisted success itself
    });

    it('regenerateSlotImage restores the previous image when generation fails, but keeps the new error visible', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, mediaUrl: 'https://x/old.png' }));
      mockEnsureAutopostImage.mockResolvedValue(null); // ensureAutopostImage's own failure path already cleared media_url
      mockGetTelegramPost.mockResolvedValueOnce(draftPost({ id: 5, mediaUrl: null, imageError: 'OpenAI quota exceeded' }));

      await regenerateSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(mockSetAutopostImageResult).toHaveBeenCalledWith(5, 'https://x/old.png', 'OpenAI quota exceeded');
    });

    it('regenerateSlotImage never touches media_url when there was no previous image and generation fails', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, mediaUrl: null }));
      mockEnsureAutopostImage.mockResolvedValue(null);
      mockGetTelegramPost.mockResolvedValue(draftPost({ id: 5, mediaUrl: null, imageError: 'failed' }));

      await regenerateSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(mockSetAutopostImageResult).not.toHaveBeenCalled();
    });
  });

  describe('assignSlotImage', () => {
    it('persists a Media Library URL directly, no OpenAI/R2 call, after validating against the Telegram photo limit', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));

      await assignSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://svetikony.com/media/library/pick.png');

      expect(mockEnsureAutopostImage).not.toHaveBeenCalled();
      expect(mockValidateTelegramMediaAsset).toHaveBeenCalledWith('https://svetikony.com/media/library/pick.png', 'photo');
      expect(mockSetAutopostImageResult).toHaveBeenCalledWith(5, 'https://svetikony.com/media/library/pick.png', null);
    });

    it('rejects assigning an image to a sent slot', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sent' }));

      await expectRejectionDetails(assignSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://x/pick.png'), /already been sent/);
    });

    it('rejects and never persists when the asset fails Telegram validation (oversized, wrong format, etc.)', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));
      mockValidateTelegramMediaAsset.mockRejectedValue(new Error("File exceeds Telegram's 5 MB limit for photos sent by URL"));

      await expect(assignSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://svetikony.com/media/library/big.png')).rejects.toThrow(
        /5 MB limit/,
      );
      expect(mockSetAutopostImageResult).not.toHaveBeenCalled();
    });
  });

  describe('removeSlotImage', () => {
    it('clears mediaUrl without touching text/status', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, mediaUrl: 'https://x/pick.png' }));

      await removeSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(mockSetAutopostImageResult).toHaveBeenCalledWith(5, null, null);
    });

    it('404s when nothing has been prepared for the slot yet', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(null);
      await expectRejectionDetails(removeSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer'), /nothing has been prepared/);
    });

    it('rejects removing the image of a sent slot', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, status: 'sent' }));
      await expectRejectionDetails(removeSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);
    });
  });

  describe('assignSlotAudio', () => {
    it('persists a Media Library URL directly, no OpenAI/R2 call, after validating against the Telegram audio limit/format', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));

      await assignSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://svetikony.com/media/library/pick.mp3');

      expect(mockValidateTelegramMediaAsset).toHaveBeenCalledWith('https://svetikony.com/media/library/pick.mp3', 'audio');
      expect(mockSetAutopostAudioResult).toHaveBeenCalledWith(5, 'https://svetikony.com/media/library/pick.mp3');
    });

    it('rejects assigning audio to a sent slot', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sent' }));

      await expectRejectionDetails(assignSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://x/pick.mp3'), /already been sent/);
    });

    it('rejects and never persists when the asset fails Telegram validation (oversized, wrong format, etc.)', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));
      mockValidateTelegramMediaAsset.mockRejectedValue(new Error('Unsupported audio format for Telegram: audio/ogg -- use MP3 or M4A'));

      await expect(assignSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://svetikony.com/media/library/pick.ogg')).rejects.toThrow(
        /MP3 or M4A/,
      );
      expect(mockSetAutopostAudioResult).not.toHaveBeenCalled();
    });

    it('does not require an image to exist -- audio and photo are independent', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, mediaUrl: null }));

      await assignSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://svetikony.com/media/library/pick.mp3');

      expect(mockSetAutopostAudioResult).toHaveBeenCalledWith(5, 'https://svetikony.com/media/library/pick.mp3');
    });
  });

  describe('removeSlotAudio', () => {
    it('clears audioUrl without touching text/status/mediaUrl', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, audioUrl: 'https://x/pick.mp3' }));

      await removeSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(mockSetAutopostAudioResult).toHaveBeenCalledWith(5, null);
    });

    it('404s when nothing has been prepared for the slot yet', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(null);
      await expectRejectionDetails(removeSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer'), /nothing has been prepared/);
    });

    it('rejects removing the audio of a sent slot', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, status: 'sent' }));
      await expectRejectionDetails(removeSlotAudio(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);
    });
  });

  describe('markSlotReady / markSlotUnready', () => {
    it('marks ready when text is non-empty and no verification is required', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, text: 'Готовий текст' }));
      mockSetAutopostSlotReady.mockResolvedValue(draftPost({ id: 5, text: 'Готовий текст', status: 'ready' }));

      const result = await markSlotReady(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(result.status).toBe('ready');
    });

    it('rejects marking ready when text is empty (reuses validateBeforeSend\'s exact rule)', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, text: null }));

      await expectRejectionDetails(markSlotReady(PLAIN_CIVIL_DATE, 'morning_prayer'), /cannot mark ready/);
      expect(mockSetAutopostSlotReady).not.toHaveBeenCalled();
    });

    it('rejects marking a saint_of_day slot ready when its stored verificationStatus is not "verified"', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, contentType: 'saint_of_day', text: 'Текст', verificationStatus: null }));

      await expectRejectionDetails(markSlotReady(PLAIN_CIVIL_DATE, 'saint_of_day'), /cannot mark ready/);
    });

    it('does NOT require an image to mark ready -- image is confirmed optional in the existing send-validation policy', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, text: 'Текст без зображення', mediaUrl: null }));
      mockSetAutopostSlotReady.mockResolvedValue(draftPost({ id: 5, status: 'ready' }));

      const result = await markSlotReady(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(result.status).toBe('ready');
    });

    it('404s when nothing has been prepared for the slot yet', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(null);
      await expectRejectionDetails(markSlotReady(PLAIN_CIVIL_DATE, 'morning_prayer'), /nothing has been prepared/);
    });

    it('never marks a sent slot ready/unready', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, status: 'sent', text: 'x' }));
      await expectRejectionDetails(markSlotReady(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);

      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, status: 'sent', text: 'x' }));
      await expectRejectionDetails(markSlotUnready(PLAIN_CIVIL_DATE, 'morning_prayer'), /already been sent/);
    });

    it('unready reverses ready back to draft', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(draftPost({ id: 5, status: 'ready', text: 'x' }));
      mockSetAutopostSlotUnready.mockResolvedValue(draftPost({ id: 5, status: 'draft', text: 'x' }));

      const result = await markSlotUnready(PLAIN_CIVIL_DATE, 'morning_prayer');

      expect(result.status).toBe('draft');
    });
  });

  describe('prepareContentPlanDay', () => {
    const ID_BY_TYPE: Record<string, number> = {
      morning_prayer: 1,
      saint_of_day: 2,
      gospel: 3,
      faith_story: 4,
      evening_prayer: 5,
    };

    it('prepares every slot when nothing exists yet and every source is available (incl. a verifying saint_of_day)', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(null);
      mockLoadAutopostFacts.mockResolvedValue({
        status: 'ok',
        facts: { facts: 'факти', sourceType: 'x', sourceId: '1', candidateName: 'Флор і Лавр' },
      });
      mockFindOrCreatePreparedSlot.mockImplementation(async (input: { contentType: string }) =>
        draftPost({ id: ID_BY_TYPE[input.contentType], status: 'draft', contentType: input.contentType }),
      );
      mockGenerateTelegramPost.mockResolvedValue('Текст.');
      mockEnsureAutopostImage.mockResolvedValue('https://x/img.png');
      mockGetTelegramPost.mockImplementation(async (id: number) => draftPost({ id, mediaUrl: 'https://x/img.png' }));

      const report = await prepareContentPlanDay(VERIFIED_CIVIL_DATE);

      expect(report.date).toBe(VERIFIED_CIVIL_DATE);
      expect(report.total).toBe(5);
      expect(report.prepared).toBe(5);
      expect(report.alreadyPrepared + report.skippedReady + report.skippedSent + report.skippedSending).toBe(0);
      expect(report.missingSource + report.reviewRequired + report.imageFailed + report.failed).toBe(0);
      expect(report.results.map((r) => r.contentType)).toEqual([
        'morning_prayer',
        'saint_of_day',
        'gospel',
        'faith_story',
        'evening_prayer',
      ]);
      expect(mockGenerateTelegramPost).toHaveBeenCalledTimes(5);
      expect(mockEnsureAutopostImage).toHaveBeenCalledTimes(5);
      // Prepare Day fills DRAFT content only -- it never confirms a slot ready.
      expect(mockSetAutopostSlotReady).not.toHaveBeenCalled();
    });

    it('skips sent/sending/ready slots untouched and never calls generation for them', async () => {
      mockFindTelegramPostBySlot.mockImplementation(async (contentType: string) => {
        if (contentType === 'morning_prayer') return draftPost({ id: 1, status: 'sent', text: 'x' });
        if (contentType === 'saint_of_day') return draftPost({ id: 2, status: 'sending', text: 'x' });
        if (contentType === 'gospel') return draftPost({ id: 3, status: 'ready', text: 'x' });
        return null; // faith_story, evening_prayer -- no row yet
      });
      mockLoadAutopostFacts.mockResolvedValue({ status: 'missing_source' });

      const report = await prepareContentPlanDay(PLAIN_CIVIL_DATE);

      expect(report.skippedSent).toBe(1);
      expect(report.skippedSending).toBe(1);
      expect(report.skippedReady).toBe(1);
      expect(report.missingSource).toBe(2);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockFindOrCreatePreparedSlot).not.toHaveBeenCalled();
    });

    it('preserves an existing text and only fills the missing image -- fully-prepared slots are left completely alone', async () => {
      mockFindTelegramPostBySlot.mockImplementation(async (contentType: string) =>
        contentType === 'morning_prayer'
          ? draftPost({ id: 10, status: 'draft', text: 'Вже написаний текст', mediaUrl: null })
          : draftPost({ id: 20, status: 'draft', text: 'Текст', mediaUrl: 'https://x/existing.png' }),
      );
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 10, status: 'draft', text: 'Вже написаний текст', mediaUrl: null }));
      mockEnsureAutopostImage.mockResolvedValue('https://x/new.png');
      mockGetTelegramPost.mockResolvedValue(draftPost({ id: 10, text: 'Вже написаний текст', mediaUrl: 'https://x/new.png' }));

      const report = await prepareContentPlanDay(PLAIN_CIVIL_DATE);

      expect(report.prepared).toBe(1);
      expect(report.alreadyPrepared).toBe(4);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled(); // no slot needed text
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
      expect(mockEnsureAutopostImage).toHaveBeenCalledTimes(1); // morning_prayer only
    });

    it('one slot failing (review required / missing source / a failed image) never stops the rest of the day', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(null);
      mockLoadAutopostFacts.mockImplementation(async (contentType: string) => {
        if (contentType === 'gospel') return { status: 'missing_source' };
        return { status: 'ok', facts: { facts: 'x', sourceType: 'x', sourceId: '1', candidateName: 'Хтось' } };
      });
      mockFindOrCreatePreparedSlot.mockImplementation(async (input: { contentType: string }) =>
        draftPost({ id: ID_BY_TYPE[input.contentType], status: 'draft', contentType: input.contentType }),
      );
      mockGenerateTelegramPost.mockResolvedValue('Текст.');
      mockEnsureAutopostImage.mockResolvedValue('https://x/img.png');
      mockGetTelegramPost.mockImplementation(async (id: number) =>
        id === ID_BY_TYPE.faith_story
          ? draftPost({ id, text: 'Текст.', mediaUrl: null, imageError: 'OpenAI quota exceeded' })
          : draftPost({ id, mediaUrl: 'https://x/img.png' }),
      );

      // saint_of_day never verifies at UNVERIFIED_CIVIL_DATE regardless of candidateName (no real entry for that date).
      const report = await prepareContentPlanDay(UNVERIFIED_CIVIL_DATE);

      expect(report.total).toBe(5);
      expect(report.results).toEqual([
        { contentType: 'morning_prayer', result: 'prepared' },
        { contentType: 'saint_of_day', result: 'review_required', error: expect.stringContaining('REVIEW_REQUIRED') },
        { contentType: 'gospel', result: 'missing_source', error: expect.stringContaining('MISSING_SOURCE') },
        { contentType: 'faith_story', result: 'image_failed', error: 'OpenAI quota exceeded' },
        { contentType: 'evening_prayer', result: 'prepared' },
      ]);
      expect(report.prepared).toBe(2);
      expect(report.reviewRequired).toBe(1);
      expect(report.missingSource).toBe(1);
      expect(report.imageFailed).toBe(1);
      expect(report.failed).toBe(0);
    });

    it('isolates an unexpected AI text-generation failure to just that slot ("failed"), the rest still complete', async () => {
      mockFindTelegramPostBySlot.mockResolvedValue(null);
      mockLoadAutopostFacts.mockImplementation(async (contentType: string) => {
        if (contentType === 'saint_of_day') return { status: 'missing_source' }; // kept deterministic, not the point of this test
        if (contentType === 'gospel') return { status: 'ok', facts: { facts: 'FAIL_MARKER', sourceType: 'x', sourceId: '1' } };
        return { status: 'ok', facts: { facts: 'ok facts', sourceType: 'x', sourceId: '1' } };
      });
      mockFindOrCreatePreparedSlot.mockImplementation(async (input: { contentType: string }) =>
        draftPost({ id: ID_BY_TYPE[input.contentType], status: 'draft', contentType: input.contentType }),
      );
      mockGenerateTelegramPost.mockImplementation(async (args: { facts: string }) => {
        if (args.facts === 'FAIL_MARKER') throw new Error('OpenAI rate limit exceeded');
        return 'Текст.';
      });
      mockEnsureAutopostImage.mockResolvedValue('https://x/img.png');
      mockGetTelegramPost.mockImplementation(async (id: number) => draftPost({ id, mediaUrl: 'https://x/img.png' }));

      const report = await prepareContentPlanDay(PLAIN_CIVIL_DATE);

      expect(report.failed).toBe(1);
      expect(report.results.find((r) => r.contentType === 'gospel')).toEqual({
        contentType: 'gospel',
        result: 'failed',
        error: 'OpenAI rate limit exceeded',
      });
      expect(report.missingSource).toBe(1); // saint_of_day
      expect(report.prepared).toBe(3); // morning_prayer, faith_story, evening_prayer
      expect(mockGenerateTelegramPost).toHaveBeenCalledTimes(4); // not saint_of_day, which never reaches it
    });

    it('never touches a slot that becomes sent between its own status check and its generation call (concurrency with the live cron)', async () => {
      let morningCallCount = 0;
      mockFindTelegramPostBySlot.mockImplementation(async (contentType: string) => {
        if (contentType === 'morning_prayer') {
          morningCallCount += 1;
          return morningCallCount === 1 ? null : draftPost({ id: 1, status: 'sent', text: 'Опубліковано' });
        }
        return draftPost({ id: 99, status: 'sent' }); // other four slots: trivially already sent
      });
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      // Simulates the autopost tick claiming and sending this exact slot in the moment between
      // prepareSlot's own read and generateSlotText's resolveOrCreateSlot call.
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 1, status: 'sent', text: 'Опубліковано' }));

      const report = await prepareContentPlanDay(PLAIN_CIVIL_DATE);

      expect(report.results[0]).toEqual({ contentType: 'morning_prayer', result: 'skipped_sent' });
      expect(report.skippedSent).toBe(5);
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
    });

    it('treats a concurrent "already has text" conflict as filled-in, not a failure -- never overwrites what was just written', async () => {
      mockFindTelegramPostBySlot.mockResolvedValueOnce(null).mockResolvedValue(draftPost({ id: 99, status: 'sent' }));
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      // Simulates another admin action filling the text in between this function's own
      // read (null) and generateSlotText's resolveOrCreateSlot call.
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 1, status: 'draft', text: 'Вже хтось написав', mediaUrl: null }));
      mockEnsureAutopostImage.mockResolvedValue('https://x/img.png');
      mockGetTelegramPost.mockResolvedValue(draftPost({ id: 1, mediaUrl: 'https://x/img.png' }));

      const report = await prepareContentPlanDay(PLAIN_CIVIL_DATE);

      expect(report.results[0]).toEqual({ contentType: 'morning_prayer', result: 'prepared' });
      expect(mockGenerateTelegramPost).not.toHaveBeenCalled();
      expect(mockSetPreparedPostText).not.toHaveBeenCalled();
      expect(mockEnsureAutopostImage).toHaveBeenCalledTimes(1);
    });

    it('never calls Telegram, regardless of outcome mix -- content-plan-actions.ts has no Telegram-sending import at all', () => {
      const source = readFileSync(join(__dirname, 'content-plan-actions.ts'), 'utf8');
      expect(source).not.toMatch(/sendAutopostMessage|client\.sendMessage|client\.sendPhoto/);
    });
  });
});
