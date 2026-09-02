import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import type { ChurchSaintDto } from '@/lib/d1/repositories/saints';

const mockGetCalendarDay = vi.fn();
const mockUpdateCalendarDay = vi.fn();
vi.mock('@/lib/d1/repositories/calendarDays', () => ({
  getCalendarDay: mockGetCalendarDay,
  updateCalendarDay: mockUpdateCalendarDay,
}));

const mockListSaints = vi.fn(async () => [] as ChurchSaintDto[]);
vi.mock('@/lib/d1/repositories/saints', () => ({ listSaints: mockListSaints }));

const mockGenerateChurchContent = vi.fn();
vi.mock('@/lib/ai/church-content', () => ({ generateChurchContent: mockGenerateChurchContent }));

const mockGenerateTelegramImage = vi.fn();
vi.mock('@/lib/ai/openai-image', () => ({ generateTelegramImage: mockGenerateTelegramImage }));

const mockBucketPut = vi.fn(async () => ({}));
vi.mock('@/lib/d1/env', () => ({ getMediaBucket: async () => ({ put: mockBucketPut }) }));

const mockGetOpenAiConfig = vi.fn(async () => ({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined }));
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: mockGetOpenAiConfig }));

const {
  assignCalendarImage,
  fillMissingCalendarContent,
  generateCalendarDescription,
  generateCalendarHistory,
  generateCalendarImage,
  generateCalendarSeo,
  regenerateCalendarDescription,
  regenerateCalendarHistory,
  regenerateCalendarImage,
  regenerateCalendarSeo,
} = await import('./calendar-ai-actions');

/** Real orthodox-calendar-verifier.ts/orthodox-calendar-sources.ts, used
 * unmocked -- same convention as content-plan-actions.test.ts. Julian
 * 2026-08-18 genuinely two-source-verifies as "Флор і Лавр"; julian
 * 2025-12-19 has no reference entry at all, so it deterministically fails. */
const VERIFIED_OLD_STYLE = '2026-08-18';
const VERIFIED_NEW_STYLE = '2026-08-31';
const UNVERIFIED_OLD_STYLE = '2025-12-19';
const UNVERIFIED_NEW_STYLE = '2026-01-01';

function calendarDay(overrides: Partial<ChurchCalendarDayDto> = {}): ChurchCalendarDayDto {
  return {
    id: 'day-1',
    siteId: 'site',
    dateOldStyle: null,
    dateNewStyle: '2026-09-02',
    calendarType: 'both',
    title: 'Пророк Самуїл',
    slug: 'prophet-samuel',
    language: 'uk',
    translationGroupId: 'group',
    dayType: 'saint',
    description: '',
    history: '',
    imageUrl: '',
    rank: 0,
    status: 'draft',
    seoTitle: null,
    seoDescription: null,
    isGlobal: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function saint(overrides: Partial<ChurchSaintDto> = {}): ChurchSaintDto {
  return {
    id: 'saint-1',
    siteId: 'site',
    iconId: null,
    calendarDayId: 'day-1',
    slug: 'prophet-samuel',
    name: 'Флор і Лавр',
    shortDescription: 'Короткий опис',
    biography: 'Житіє',
    feastDayOldStyle: '',
    feastDayNewStyle: '',
    imageUrl: '',
    language: 'uk',
    translationGroupId: 'group',
    status: 'published',
    isGlobal: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

async function expectRejectionDetails(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toMatchObject({ details: expect.stringMatching(pattern) });
}

describe('calendar-ai-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockUpdateCalendarDay.mockImplementation(async (id: string, patch: Partial<ChurchCalendarDayDto>) => calendarDay({ id, ...patch }));
  });

  describe('generateCalendarDescription / regenerateCalendarDescription', () => {
    it('refuses to overwrite an existing description', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: 'Вже є опис' }));
      await expectRejectionDetails(generateCalendarDescription('day-1'), /already has a description/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
    });

    it('generates and saves a description when none exists, for a day with no linked saint', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Згенерований опис.');

      const result = await generateCalendarDescription('day-1');

      expect(mockGenerateChurchContent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'description', verified: false }));
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { description: 'Згенерований опис.' });
      expect(result.description).toBe('Згенерований опис.');
    });

    it('regenerate always overwrites, even when a description already exists', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: 'Старий опис' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Новий опис.');

      await regenerateCalendarDescription('day-1');

      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { description: 'Новий опис.' });
    });

    it('blocks generation when a linked saint has no old-style date to verify against (MISSING_SOURCE-equivalent)', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ dateOldStyle: null }));
      mockListSaints.mockResolvedValue([saint()]);

      await expectRejectionDetails(generateCalendarDescription('day-1'), /REVIEW_REQUIRED/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
    });

    it('blocks generation when the linked saint fails two-source verification (REVIEW_REQUIRED)', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ dateOldStyle: UNVERIFIED_OLD_STYLE, dateNewStyle: UNVERIFIED_NEW_STYLE }),
      );
      mockListSaints.mockResolvedValue([saint({ name: 'Невідомий святий' })]);

      await expectRejectionDetails(generateCalendarDescription('day-1'), /REVIEW_REQUIRED/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
    });

    it('generates with verified=true and includes the saint facts when the linked saint verifies', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ dateOldStyle: VERIFIED_OLD_STYLE, dateNewStyle: VERIFIED_NEW_STYLE, description: '' }),
      );
      mockListSaints.mockResolvedValue([saint({ name: 'Флор і Лавр' })]);
      mockGenerateChurchContent.mockResolvedValue('Опис про Флора і Лавра.');

      await generateCalendarDescription('day-1');

      expect(mockGenerateChurchContent).toHaveBeenCalledWith(
        expect.objectContaining({ verified: true, facts: expect.stringContaining('Флор і Лавр') }),
      );
    });
  });

  describe('generateCalendarHistory / regenerateCalendarHistory', () => {
    it('refuses to overwrite existing history text', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ history: 'Вже є текст' }));
      await expectRejectionDetails(generateCalendarHistory('day-1'), /already has history text/);
    });

    it('fills missing history for a day with no linked saint (no verification required)', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ history: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Історичний текст.');

      await generateCalendarHistory('day-1');

      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { history: 'Історичний текст.' });
    });

    it('regenerate overwrites existing history', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ history: 'Старий текст' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Новий текст.');

      await regenerateCalendarHistory('day-1');
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { history: 'Новий текст.' });
    });
  });

  describe('generateCalendarSeo / regenerateCalendarSeo', () => {
    it('refuses only when BOTH seoTitle and seoDescription already exist', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ seoTitle: 'T', seoDescription: 'D' }));
      await expectRejectionDetails(generateCalendarSeo('day-1'), /already has SEO title and description/);
    });

    it('fills only the missing SEO field, preserving the existing one', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ seoTitle: 'Наявний title', seoDescription: null }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Згенерований SEO description.');

      await generateCalendarSeo('day-1');

      expect(mockGenerateChurchContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateChurchContent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'seo_description' }));
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        seoTitle: 'Наявний title',
        seoDescription: 'Згенерований SEO description.',
      });
    });

    it('regenerate always overwrites both fields', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ seoTitle: 'Old', seoDescription: 'Old' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValueOnce('New title').mockResolvedValueOnce('New description');

      await regenerateCalendarSeo('day-1');

      expect(mockGenerateChurchContent).toHaveBeenCalledTimes(2);
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { seoTitle: 'New title', seoDescription: 'New description' });
    });
  });

  describe('generateCalendarImage / regenerateCalendarImage / assignCalendarImage', () => {
    it('refuses to overwrite an existing image', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: 'media/calendar/day-1/main/existing.png' }));
      await expectRejectionDetails(generateCalendarImage('day-1'), /already has an image/);
      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
    });

    it('prefers the linked saint\'s own verified image over AI generation', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: 'media/saints/saint-1/main/icon.png' })]);

      const result = await generateCalendarImage('day-1');

      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(result.imageUrl).toBe('media/saints/saint-1/main/icon.png');
    });

    it('falls back to a safe AI thematic image (no saint portrait) when no saint image exists', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateTelegramImage.mockResolvedValue({ bytes: new ArrayBuffer(4), mimeType: 'image/png' });

      await generateCalendarImage('day-1');

      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: expect.stringContaining('без жодної впізнаваної людської постаті') }),
      );
      expect(mockBucketPut).toHaveBeenCalled();
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { imageUrl: expect.stringMatching(/^media\/calendar\/day-1\/main\//) });
    });

    it('regenerate restores the previous image when generation fails', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: 'media/calendar/day-1/main/old.png' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateTelegramImage.mockRejectedValue(new Error('OpenAI quota exceeded'));

      const result = await regenerateCalendarImage('day-1');

      expect(mockUpdateCalendarDay).toHaveBeenLastCalledWith('day-1', { imageUrl: 'media/calendar/day-1/main/old.png' });
      expect(result.imageUrl).toBe('media/calendar/day-1/main/old.png');
    });

    it('assignCalendarImage persists a Media Library key directly, no AI call', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay());
      await assignCalendarImage('day-1', 'media/calendar/day-1/main/picked.png');

      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { imageUrl: 'media/calendar/day-1/main/picked.png' });
    });
  });

  describe('fillMissingCalendarContent', () => {
    /** fillMissingCalendarContent re-reads its own `day` variable after
     * each sub-action (e.g. `day = await regenerateCalendarDescription(...)`),
     * so the mocked updateCalendarDay must behave like the real one -- merge
     * the patch onto the CURRENT row and return the merged result, not a
     * fresh default-filled row -- or an already-filled field (like history
     * here) would spuriously appear empty again after a later action. */
    function stateful(initial: ChurchCalendarDayDto) {
      let current = initial;
      mockGetCalendarDay.mockImplementation(async () => current);
      mockUpdateCalendarDay.mockImplementation(async (_id: string, patch: Partial<ChurchCalendarDayDto>) => {
        current = { ...current, ...patch };
        return current;
      });
      return () => current;
    }

    it('fills every missing field and leaves nothing that already had content untouched', async () => {
      stateful(calendarDay({ description: '', history: 'Вже написано вручну', seoTitle: null, seoDescription: null, imageUrl: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockImplementation(async (input: { kind: string }) => `generated-${input.kind}`);
      mockGenerateTelegramImage.mockResolvedValue({ bytes: new ArrayBuffer(4), mimeType: 'image/png' });

      const result = await fillMissingCalendarContent('day-1');

      expect(result.filled.sort()).toEqual(['description', 'image', 'seo']);
      expect(result.skipped).toEqual([]);
      // history was already present -- never regenerated, never overwritten.
      expect(mockGenerateChurchContent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'history' }));
      expect(result.day.history).toBe('Вже написано вручну');
    });

    it('does nothing at all when every field already has content', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ description: 'x', history: 'x', seoTitle: 'x', seoDescription: 'x', imageUrl: 'media/calendar/day-1/main/x.png' }),
      );
      mockListSaints.mockResolvedValue([]);

      const result = await fillMissingCalendarContent('day-1');

      expect(result.filled).toEqual([]);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });

    it('skips all factual fields (description/history/SEO) when the linked saint fails verification, but still tries the image', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({
          dateOldStyle: UNVERIFIED_OLD_STYLE,
          dateNewStyle: UNVERIFIED_NEW_STYLE,
          description: '',
          history: '',
          seoTitle: null,
          seoDescription: null,
          imageUrl: '',
        }),
      );
      mockListSaints.mockResolvedValue([saint({ name: 'Невідомий святий' })]);
      mockGenerateTelegramImage.mockResolvedValue({ bytes: new ArrayBuffer(4), mimeType: 'image/png' });

      const result = await fillMissingCalendarContent('day-1');

      expect(result.skipped).toEqual(
        expect.arrayContaining([
          { field: 'description', reason: 'review_required' },
          { field: 'history', reason: 'review_required' },
          { field: 'seo', reason: 'review_required' },
        ]),
      );
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
      // Image safety doesn't depend on the saint-identity verification gate.
      expect(result.filled).toContain('image');
    });

    it('never sets `status` -- fill-missing can never publish the website', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: '', history: '', seoTitle: null, seoDescription: null, imageUrl: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('text');
      mockGenerateTelegramImage.mockResolvedValue({ bytes: new ArrayBuffer(4), mimeType: 'image/png' });

      await fillMissingCalendarContent('day-1');

      for (const call of mockUpdateCalendarDay.mock.calls) {
        expect(call[1]).not.toHaveProperty('status');
      }
    });
  });

  it('never calls Telegram -- calendar-ai-actions.ts has no Telegram-sending import at all', () => {
    const source = readFileSync(join(__dirname, 'calendar-ai-actions.ts'), 'utf8');
    expect(source).not.toMatch(/sendAutopostMessage|TelegramClient|client\.sendMessage|client\.sendPhoto/);
  });
});
