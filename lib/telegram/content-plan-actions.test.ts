import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTelegramPost = vi.fn();
vi.mock('@/lib/d1/repositories/telegram', () => ({ getTelegramPost: mockGetTelegramPost }));

const mockFindOrCreatePreparedSlot = vi.fn();
const mockFindTelegramPostBySlot = vi.fn();
const mockSetAutopostImageResult = vi.fn();
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
    setAutopostSlotReady: mockSetAutopostSlotReady,
    setAutopostSlotUnready: mockSetAutopostSlotUnready,
    setAutopostVerificationResult: mockSetAutopostVerificationResult,
    setPreparedPostText: mockSetPreparedPostText,
  };
});

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
  assignSlotImage,
  editSlotText,
  generateSlotImage,
  generateSlotText,
  markSlotReady,
  markSlotUnready,
  regenerateSlotImage,
  regenerateSlotText,
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
      expect(mockGenerateTelegramPost).toHaveBeenCalledWith(expect.objectContaining({ verifiedFacts: true, titleLine: '☦️ Флор і Лавр' }));
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
    it('persists a Media Library URL directly, no OpenAI/R2 call', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5 }));

      await assignSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://svetikony.com/media/library/pick.png');

      expect(mockEnsureAutopostImage).not.toHaveBeenCalled();
      expect(mockSetAutopostImageResult).toHaveBeenCalledWith(5, 'https://svetikony.com/media/library/pick.png', null);
    });

    it('rejects assigning an image to a sent slot', async () => {
      mockLoadAutopostFacts.mockResolvedValue(OK_FACTS);
      mockFindOrCreatePreparedSlot.mockResolvedValue(draftPost({ id: 5, status: 'sent' }));

      await expectRejectionDetails(assignSlotImage(PLAIN_CIVIL_DATE, 'morning_prayer', 'https://x/pick.png'), /already been sent/);
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
});
