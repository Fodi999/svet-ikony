import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateTelegramImageInput, GeneratedImage } from '@/lib/ai/openai-image';
import type { ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import type { ChurchSaintDto } from '@/lib/d1/repositories/saints';
import type { SaintLookupResult } from '@/lib/church/saint-reference';
import type { FillMissingCalendarResult } from '@/lib/church/calendar-ai-actions';

const mockGetCalendarDay = vi.fn();
const mockUpdateCalendarDay = vi.fn();
vi.mock('@/lib/d1/repositories/calendarDays', () => ({
  getCalendarDay: mockGetCalendarDay,
  updateCalendarDay: mockUpdateCalendarDay,
}));

const mockListSaints = vi.fn(async () => [] as ChurchSaintDto[]);
vi.mock('@/lib/d1/repositories/saints', () => ({ listSaints: mockListSaints }));

const mockGenerateChurchContent = vi.fn();
const mockDescribeSaintIconography = vi.fn(async () => null as string | null);
vi.mock('@/lib/ai/church-content', () => ({
  generateChurchContent: mockGenerateChurchContent,
  describeSaintIconography: mockDescribeSaintIconography,
}));

const mockGenerateTelegramImage = vi.fn<(input: GenerateTelegramImageInput) => Promise<GeneratedImage>>(async () => ({
  bytes: new ArrayBuffer(4),
  mimeType: 'image/png',
}));
vi.mock('@/lib/ai/openai-image', () => ({ generateTelegramImage: mockGenerateTelegramImage }));

/** Wikipedia lookup is ALWAYS mocked -- no test in this file may ever make
 * a real network call (task: "NO real Wikipedia network calls in tests").
 * Defaults to 'not_found' so any test that doesn't care about the
 * Wikipedia step still exercises the generic-fallback path deterministically. */
const mockLookupVerifiedSaintReference = vi.fn<(query: unknown) => Promise<SaintLookupResult>>(async () => ({ status: 'not_found' }));
vi.mock('@/lib/church/saint-reference', () => ({ lookupVerifiedSaintReference: mockLookupVerifiedSaintReference }));

const mockBucketPut = vi.fn(async () => ({}));
vi.mock('@/lib/d1/env', () => ({ getMediaBucket: async () => ({ put: mockBucketPut }) }));

const mockGetOpenAiConfig = vi.fn(async () => ({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined }));
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: mockGetOpenAiConfig }));

/** proposeMissingCalendarContent() (PUBLISHED-day fill-missing) dynamically
 * imports this module -- see that function's own doc comment for why it's
 * dynamic rather than a static top-level import. Mocked wholesale here so
 * these tests stay unit-scoped to calendar-ai-actions.ts: does it detect
 * the right missing fields and hand them to createHumanAuthoredProposal
 * with the right patch, never touching updateCalendarDay? Its own
 * validation/attribution/DB behavior is covered by proposals.test.ts. */
const mockCreateHumanAuthoredProposal = vi.fn(async (_request: Request, _adminUserId: string, _targetType: string, _targetId: string, patch: unknown) => ({
  id: 'proposal-1',
  status: 'pending',
  patch,
}));
vi.mock('@/lib/ai-access/proposals', () => ({ createHumanAuthoredProposal: mockCreateHumanAuthoredProposal }));

const {
  assignCalendarImage,
  fillMissingCalendarContent,
  generateCalendarDescription,
  generateCalendarHistory,
  generateCalendarImage,
  generateCalendarImageFromPrompt,
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
    imageMetadata: null,
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

/** Every draft-day test in this file (calendarDay()'s own default
 * status) always takes the direct-write branch of writeOrPropose(), so
 * this context is never actually read for attribution -- it only needs
 * to satisfy each action's required second parameter. */
const draftContext = { request: new Request('http://localhost/'), adminUserId: 'admin-1' };

async function expectRejectionDetails(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toMatchObject({ details: expect.stringMatching(pattern) });
}

describe('calendar-ai-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
    mockUpdateCalendarDay.mockImplementation(async (id: string, patch: Partial<ChurchCalendarDayDto>) => calendarDay({ id, ...patch }));
    // Explicit reset every test (not just vi.clearAllMocks(), which does not
    // undo a persistent .mockResolvedValue() from a previous test) -- so a
    // test that doesn't care about the Wikipedia/vision steps always gets
    // the same safe "nothing found" defaults regardless of execution order.
    mockLookupVerifiedSaintReference.mockResolvedValue({ status: 'not_found' });
    mockDescribeSaintIconography.mockResolvedValue(null);
    mockGenerateTelegramImage.mockResolvedValue({ bytes: new ArrayBuffer(4), mimeType: 'image/png' });
  });

  describe('generateCalendarDescription / regenerateCalendarDescription', () => {
    it('refuses to overwrite an existing description', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: 'Вже є опис' }));
      await expectRejectionDetails(generateCalendarDescription('day-1', draftContext), /already has a description/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
    });

    it('generates and saves a description when none exists, for a day with no linked saint', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Згенерований опис.');

      const result = await generateCalendarDescription('day-1', draftContext);

      expect(mockGenerateChurchContent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'description', verified: false }));
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { description: 'Згенерований опис.' });
      expect(result.day.description).toBe('Згенерований опис.');
    });

    it('regenerate always overwrites, even when a description already exists', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ description: 'Старий опис' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Новий опис.');

      await regenerateCalendarDescription('day-1', draftContext);

      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { description: 'Новий опис.' });
    });

    it('blocks generation when a linked saint has no old-style date to verify against (MISSING_SOURCE-equivalent)', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ dateOldStyle: null }));
      mockListSaints.mockResolvedValue([saint()]);

      await expectRejectionDetails(generateCalendarDescription('day-1', draftContext), /REVIEW_REQUIRED/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
    });

    it('blocks generation when the linked saint fails two-source verification (REVIEW_REQUIRED)', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ dateOldStyle: UNVERIFIED_OLD_STYLE, dateNewStyle: UNVERIFIED_NEW_STYLE }),
      );
      mockListSaints.mockResolvedValue([saint({ name: 'Невідомий святий' })]);

      await expectRejectionDetails(generateCalendarDescription('day-1', draftContext), /REVIEW_REQUIRED/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
    });

    it('generates with verified=true and includes the saint facts when the linked saint verifies', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ dateOldStyle: VERIFIED_OLD_STYLE, dateNewStyle: VERIFIED_NEW_STYLE, description: '' }),
      );
      mockListSaints.mockResolvedValue([saint({ name: 'Флор і Лавр' })]);
      mockGenerateChurchContent.mockResolvedValue('Опис про Флора і Лавра.');

      await generateCalendarDescription('day-1', draftContext);

      expect(mockGenerateChurchContent).toHaveBeenCalledWith(
        expect.objectContaining({ verified: true, facts: expect.stringContaining('Флор і Лавр') }),
      );
    });
  });

  describe('generateCalendarHistory / regenerateCalendarHistory', () => {
    it('refuses to overwrite existing history text', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ history: 'Вже є текст' }));
      await expectRejectionDetails(generateCalendarHistory('day-1', draftContext), /already has history text/);
    });

    it('fills missing history for a day with no linked saint (no verification required)', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ history: '' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Історичний текст.');

      await generateCalendarHistory('day-1', draftContext);

      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { history: 'Історичний текст.' });
    });

    it('regenerate overwrites existing history', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ history: 'Старий текст' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Новий текст.');

      await regenerateCalendarHistory('day-1', draftContext);
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { history: 'Новий текст.' });
    });
  });

  describe('generateCalendarSeo / regenerateCalendarSeo', () => {
    it('refuses only when BOTH seoTitle and seoDescription already exist', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ seoTitle: 'T', seoDescription: 'D' }));
      await expectRejectionDetails(generateCalendarSeo('day-1', draftContext), /already has SEO title and description/);
    });

    it('fills only the missing SEO field, preserving the existing one', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ seoTitle: 'Наявний title', seoDescription: null }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Згенерований опис для пошукових систем.');

      await generateCalendarSeo('day-1', draftContext);

      expect(mockGenerateChurchContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateChurchContent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'seo_description' }));
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        seoTitle: 'Наявний title',
        seoDescription: 'Згенерований опис для пошукових систем.',
      });
    });

    it('regenerate always overwrites both fields', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ seoTitle: 'Old', seoDescription: 'Old' }));
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValueOnce('Новий заголовок').mockResolvedValueOnce('Новий опис для пошукових систем');

      await regenerateCalendarSeo('day-1', draftContext);

      expect(mockGenerateChurchContent).toHaveBeenCalledTimes(2);
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        seoTitle: 'Новий заголовок',
        seoDescription: 'Новий опис для пошукових систем',
      });
    });
  });

  describe('generateCalendarImage / regenerateCalendarImage / assignCalendarImage', () => {
    it('refuses to overwrite an existing image', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: 'media/calendar/day-1/main/existing.png' }));
      await expectRejectionDetails(generateCalendarImage('day-1', draftContext), /already has an image/);
      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(mockLookupVerifiedSaintReference).not.toHaveBeenCalled();
    });

    it("prefers the linked saint's own verified local image over any Wikipedia lookup or AI generation", async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: 'media/saints/saint-1/main/icon.png' })]);

      const result = await generateCalendarImage('day-1', draftContext);

      expect(mockLookupVerifiedSaintReference).not.toHaveBeenCalled();
      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(result.day.imageUrl).toBe('media/saints/saint-1/main/icon.png');
      // A locally-verified image is neither AI-generated nor a stale AI
      // reference -- must never carry old provenance metadata forward.
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', { imageUrl: 'media/saints/saint-1/main/icon.png', imageMetadata: null });
    });

    it('falls back to the generic thematic image (no saint portrait) when there is no linked saint at all', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([]);

      await generateCalendarImage('day-1', draftContext);

      expect(mockLookupVerifiedSaintReference).not.toHaveBeenCalled();
      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: expect.stringContaining('без жодної впізнаваної людської постаті') }),
      );
      expect(mockBucketPut).toHaveBeenCalled();
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        imageUrl: expect.stringMatching(/^media\/calendar\/day-1\/main\//),
        imageMetadata: { origin: 'ai_generated', identityVerified: false },
      });
    });

    it('falls back to the generic thematic image when Wikipedia has no reliable match for the linked saint', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: '', name: 'Невідомий святий' })]);
      mockLookupVerifiedSaintReference.mockResolvedValue({ status: 'not_found' });

      await generateCalendarImage('day-1', draftContext);

      expect(mockLookupVerifiedSaintReference).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Невідомий святий' }),
      );
      expect(mockDescribeSaintIconography).not.toHaveBeenCalled();
      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: expect.stringContaining('без жодної впізнаваної людської постаті') }),
      );
      // fallbackReason records WHY the generic fallback was used (task:
      // "fallbackReason если fallback") -- defaults to the lookup status
      // when the resolver didn't supply a more specific reason string.
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith(
        'day-1',
        expect.objectContaining({ imageMetadata: { origin: 'ai_generated', identityVerified: false, fallbackReason: 'not_found' } }),
      );
    });

    it('falls back to the generic thematic image when the Wikipedia lookup rejects the candidate as ambiguous', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: '', name: 'Апостол Тадей з числа 70-ти' })]);
      mockLookupVerifiedSaintReference.mockResolvedValue({ status: 'ambiguous' });

      await generateCalendarImage('day-1', draftContext);

      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: expect.stringContaining('без жодної впізнаваної людської постаті') }),
      );
    });

    it('gracefully falls back to the generic thematic image when the Wikipedia lookup itself fails (network error)', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: '' })]);
      mockLookupVerifiedSaintReference.mockResolvedValue({ status: 'network_error' });

      await generateCalendarImage('day-1', draftContext);

      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: expect.stringContaining('без жодної впізнаваної людської постаті') }),
      );
    });

    it('generates a reference-informed saint illustration (never the generic fallback) once Wikipedia verifies the identity, and stores the reference metadata', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: '', name: 'Флор і Лавр' })]);
      mockLookupVerifiedSaintReference.mockResolvedValue({
        status: 'verified',
        reference: {
          sourceProvider: 'wikipedia',
          sourcePageUrl: 'https://uk.wikipedia.org/wiki/Флор_і_Лавр',
          sourceImageUrl: 'https://upload.wikimedia.org/flor-lavr.jpg',
          sourceTitle: 'Флор і Лавр',
        },
      });
      mockDescribeSaintIconography.mockResolvedValue('давньоруське вбрання, короткі бороди, хрести в руках');

      const result = await generateCalendarImage('day-1', draftContext);

      expect(mockDescribeSaintIconography).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://upload.wikimedia.org/flor-lavr.jpg', saintName: 'Флор і Лавр' }),
      );
      const [[imagePromptArgs]] = mockGenerateTelegramImage.mock.calls.slice(-1);
      expect(imagePromptArgs.prompt).toContain('давньоруське вбрання');
      expect(imagePromptArgs.prompt).toContain('Флор і Лавр');
      // The generic no-human-figure fallback prompt must NEVER be used once verified.
      expect(imagePromptArgs.prompt).not.toContain('без жодної впізнаваної людської постаті');
      expect(result.day.imageMetadata).toEqual({
        origin: 'ai_generated',
        referenceProvider: 'wikipedia',
        referencePageUrl: 'https://uk.wikipedia.org/wiki/Флор_і_Лавр',
        referenceImageUrl: 'https://upload.wikimedia.org/flor-lavr.jpg',
        referenceTitle: 'Флор і Лавр',
        referenceAuthor: undefined,
        referenceLicense: undefined,
        identityVerified: true,
      });
    });

    it('never asks the model to reproduce text, logos, or watermarks in either image prompt', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([saint({ imageUrl: '', name: 'Флор і Лавр' })]);
      mockLookupVerifiedSaintReference.mockResolvedValue({
        status: 'verified',
        reference: {
          sourceProvider: 'wikipedia',
          sourcePageUrl: 'https://uk.wikipedia.org/wiki/Флор_і_Лавр',
          sourceImageUrl: 'https://upload.wikimedia.org/flor-lavr.jpg',
          sourceTitle: 'Флор і Лавр',
        },
      });

      await generateCalendarImage('day-1', draftContext);
      const referencePrompt = mockGenerateTelegramImage.mock.calls.at(-1)![0].prompt as string;
      expect(referencePrompt).toMatch(/водяний знак/);
      expect(referencePrompt.toLowerCase()).not.toMatch(/\blogo\b/);

      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([]);
      await generateCalendarImage('day-1', draftContext);
      const genericPrompt = mockGenerateTelegramImage.mock.calls.at(-1)![0].prompt as string;
      expect(genericPrompt).toMatch(/напису|тексту|логотипів|водяних знаків/);
    });

    /** The exact disambiguation named in the task: Thaddeus of Edessa/Addai
     * (one of the Seventy) must never be conflated with Jude Thaddeus (one
     * of the Twelve) just because both are called "Тадей". */
    it('rejects a Wikipedia candidate whose classification contradicts the already-known local facts (Thaddeus of Edessa vs Jude Thaddeus)', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([
        saint({
          imageUrl: '',
          name: 'Апостол Тадей з числа 70-ти',
          shortDescription: 'Один із сімдесяти апостолів Христових, що приніс Євангеліє в місто Едесу.',
        }),
      ]);
      // Simulates lookupVerifiedSaintReference() itself having already
      // applied the classification-contradiction check and rejected the
      // Jude Thaddeus (Twelve Apostles) candidate as a different person.
      mockLookupVerifiedSaintReference.mockResolvedValue({ status: 'ambiguous' });

      await generateCalendarImage('day-1', draftContext);

      expect(mockDescribeSaintIconography).not.toHaveBeenCalled();
      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: expect.stringContaining('без жодної впізнаваної людської постаті') }),
      );
    });

    it('regenerate reuses an already-verified reference instead of repeating the Wikipedia lookup', async () => {
      const existingMetadata = {
        origin: 'ai_generated' as const,
        referenceProvider: 'wikipedia' as const,
        referencePageUrl: 'https://uk.wikipedia.org/wiki/Флор_і_Лавр',
        referenceImageUrl: 'https://upload.wikimedia.org/flor-lavr.jpg',
        referenceTitle: 'Флор і Лавр',
        identityVerified: true,
      };
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ imageUrl: 'media/calendar/day-1/main/old.png', imageMetadata: existingMetadata }),
      );
      mockListSaints.mockResolvedValue([saint({ imageUrl: '', name: 'Флор і Лавр' })]);

      await regenerateCalendarImage('day-1', draftContext);

      expect(mockLookupVerifiedSaintReference).not.toHaveBeenCalled();
      expect(mockDescribeSaintIconography).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://upload.wikimedia.org/flor-lavr.jpg' }),
      );
    });

    it('regenerate restores the previous image AND its provenance metadata when generation fails', async () => {
      const existingMetadata = { origin: 'ai_generated' as const, identityVerified: false };
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ imageUrl: 'media/calendar/day-1/main/old.png', imageMetadata: existingMetadata }),
      );
      mockListSaints.mockResolvedValue([]);
      mockGenerateTelegramImage.mockRejectedValue(new Error('OpenAI quota exceeded'));

      const result = await regenerateCalendarImage('day-1', draftContext);

      expect(mockUpdateCalendarDay).toHaveBeenLastCalledWith('day-1', {
        imageUrl: 'media/calendar/day-1/main/old.png',
        imageMetadata: existingMetadata,
      });
      expect(result.day.imageUrl).toBe('media/calendar/day-1/main/old.png');
      expect(result.day.imageMetadata).toEqual(existingMetadata);
    });

    it('regenerate only replaces the image after a successful generation, never before', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: 'media/calendar/day-1/main/old.png' }));
      mockListSaints.mockResolvedValue([]);

      await regenerateCalendarImage('day-1', draftContext);

      // updateCalendarDay is only ever called once here -- with the NEW
      // image, only after generateTelegramImage/storeGeneratedImage both
      // already succeeded (no separate "clear it first" write).
      expect(mockUpdateCalendarDay).toHaveBeenCalledTimes(1);
      expect(mockUpdateCalendarDay).not.toHaveBeenCalledWith('day-1', expect.objectContaining({ imageUrl: '' }));
    });

    it('assignCalendarImage persists a Media Library key directly, no AI call, and clears any stale AI provenance', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ imageMetadata: { origin: 'ai_generated', identityVerified: false } }),
      );
      await assignCalendarImage('day-1', 'media/calendar/day-1/main/picked.png');

      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(mockLookupVerifiedSaintReference).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        imageUrl: 'media/calendar/day-1/main/picked.png',
        imageMetadata: null,
      });
    });
  });

  describe('generateCalendarImageFromPrompt', () => {
    it('generates directly from the given prompt, bypassing the saint-reference resolver entirely', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));

      const result = await generateCalendarImageFromPrompt('day-1', 'Byzantine icon of a bearded martyr saint, golden halo', draftContext);

      expect(mockLookupVerifiedSaintReference).not.toHaveBeenCalled();
      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Byzantine icon of a bearded martyr saint, golden halo' }),
      );
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        imageUrl: expect.stringMatching(/^media\/calendar\/day-1\/main\//),
        imageMetadata: { origin: 'ai_generated', identityVerified: false, customPrompt: 'Byzantine icon of a bearded martyr saint, golden halo' },
      });
      expect(result.day.imageMetadata).toEqual({
        origin: 'ai_generated',
        identityVerified: false,
        customPrompt: 'Byzantine icon of a bearded martyr saint, golden halo',
      });
    });

    it('sends the prompt to OpenAI verbatim, with no house-style prefix or rewriting', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      await generateCalendarImageFromPrompt('day-1', '  A simple test prompt.  ', draftContext);
      expect(mockGenerateTelegramImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'A simple test prompt.' }));
    });

    it('rejects an empty or whitespace-only prompt without calling OpenAI', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      await expectRejectionDetails(generateCalendarImageFromPrompt('day-1', '   ', draftContext), /prompt is required/);
      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
    });

    it('always overwrites an existing image -- no "already has an image" guard, unlike generateCalendarImage', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: 'media/calendar/day-1/main/existing.png' }));
      await generateCalendarImageFromPrompt('day-1', 'New custom prompt', draftContext);
      expect(mockGenerateTelegramImage).toHaveBeenCalled();
    });

    it('restores the previous image and its provenance metadata when generation fails', async () => {
      const existingMetadata = { origin: 'ai_generated' as const, identityVerified: true, referenceProvider: 'wikipedia' as const };
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ imageUrl: 'media/calendar/day-1/main/old.png', imageMetadata: existingMetadata }),
      );
      mockGenerateTelegramImage.mockRejectedValue(new Error('OpenAI quota exceeded'));

      const result = await generateCalendarImageFromPrompt('day-1', 'A prompt that will fail', draftContext);

      expect(result.day.imageUrl).toBe('media/calendar/day-1/main/old.png');
      expect(result.day.imageMetadata).toEqual(existingMetadata);
    });

    it('does not require a linked saint at all -- works for a plain feast/event day', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ imageUrl: '' }));
      mockListSaints.mockResolvedValue([]);
      await expect(generateCalendarImageFromPrompt('day-1', 'A generic feast scene', draftContext)).resolves.toBeDefined();
    });
  });

  /**
   * The safety gap this describe block closes: every regenerate* action
   * (plus generateCalendarImageFromPrompt, which behaves like regenerate*)
   * used to write straight to updateCalendarDay() regardless of status --
   * including PUBLISHED records, with no review step at all. Now they all
   * share the same rule fillMissingCalendarContent already followed:
   * draft -> direct write and verify; published -> human-authored proposal,
   * record byte-for-byte unchanged; anything else (archived) -> refused.
   */
  describe('regenerate*/generate* actions on PUBLISHED and ARCHIVED records', () => {
    const publishedContext = { request: new Request('http://localhost/'), adminUserId: 'admin-1' };

    function expectProposalMode(result: { mode: string }): void {
      expect(result.mode).toBe('proposal');
    }

    it('regenerateCalendarDescription on PUBLISHED creates a proposal and leaves the record byte-for-byte unchanged', async () => {
      const published = calendarDay({ status: 'published', description: 'Наявний опис' });
      mockGetCalendarDay.mockResolvedValue(published);
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Новий опис.');

      const result = await regenerateCalendarDescription('day-1', publishedContext);
      expectProposalMode(result);

      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(result.day).toEqual(published);
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
        publishedContext.request,
        'admin-1',
        'calendar',
        'day-1',
        { description: 'Новий опис.' },
        expect.any(String),
      );
    });

    it('regenerateCalendarDescription on ARCHIVED is refused outright, no generation attempted', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ status: 'archived' }));
      await expectRejectionDetails(regenerateCalendarDescription('day-1', publishedContext), /requires human review/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(mockCreateHumanAuthoredProposal).not.toHaveBeenCalled();
    });

    it('regenerateCalendarHistory on PUBLISHED creates a proposal and leaves the record unchanged', async () => {
      const published = calendarDay({ status: 'published', history: 'Наявний текст' });
      mockGetCalendarDay.mockResolvedValue(published);
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Новий текст.');

      const result = await regenerateCalendarHistory('day-1', publishedContext);
      expectProposalMode(result);

      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(result.day).toEqual(published);
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
        publishedContext.request,
        'admin-1',
        'calendar',
        'day-1',
        { history: 'Новий текст.' },
        expect.any(String),
      );
    });

    it('regenerateCalendarHistory on ARCHIVED is refused outright', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ status: 'archived' }));
      await expectRejectionDetails(regenerateCalendarHistory('day-1', publishedContext), /requires human review/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });

    it('regenerateCalendarSeo on PUBLISHED creates one proposal for both fields and leaves the record unchanged', async () => {
      const published = calendarDay({ status: 'published', seoTitle: 'Old', seoDescription: 'Old' });
      mockGetCalendarDay.mockResolvedValue(published);
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValueOnce('Новий заголовок').mockResolvedValueOnce('Новий опис для пошукових систем');

      const result = await regenerateCalendarSeo('day-1', publishedContext);
      expectProposalMode(result);

      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(result.day).toEqual(published);
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
        publishedContext.request,
        'admin-1',
        'calendar',
        'day-1',
        { seoTitle: 'Новий заголовок', seoDescription: 'Новий опис для пошукових систем' },
        expect.any(String),
      );
    });

    it('regenerateCalendarSeo on ARCHIVED is refused outright', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ status: 'archived' }));
      await expectRejectionDetails(regenerateCalendarSeo('day-1', publishedContext), /requires human review/);
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });

    it('generateCalendarSeo on PUBLISHED (fills only the missing half) creates a proposal and leaves the record unchanged', async () => {
      const published = calendarDay({ status: 'published', seoTitle: 'Наявний title', seoDescription: null });
      mockGetCalendarDay.mockResolvedValue(published);
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockResolvedValue('Згенерований опис для пошукових систем.');

      const result = await generateCalendarSeo('day-1', publishedContext);
      expectProposalMode(result);

      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
        publishedContext.request,
        'admin-1',
        'calendar',
        'day-1',
        { seoTitle: 'Наявний title', seoDescription: 'Згенерований опис для пошукових систем.' },
        expect.any(String),
      );
    });

    it('regenerateCalendarImage on PUBLISHED uploads new bytes to R2 but leaves imageUrl on the record unchanged', async () => {
      const published = calendarDay({ status: 'published', imageUrl: 'media/calendar/day-1/main/old.png' });
      mockGetCalendarDay.mockResolvedValue(published);
      mockListSaints.mockResolvedValue([]);

      const result = await regenerateCalendarImage('day-1', publishedContext);
      expectProposalMode(result);

      // The new image bytes ARE uploaded to R2 either way (task: "новое
      // изображение можно загрузить в R2, но published calendar imageUrl
      // НЕ менять до Apply") -- only the calendar_days row write is gated.
      expect(mockBucketPut).toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(result.day).toEqual(published);
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
        publishedContext.request,
        'admin-1',
        'calendar',
        'day-1',
        expect.objectContaining({ imageUrl: expect.stringMatching(/^media\/calendar\/day-1\/main\//) }),
        expect.any(String),
      );
    });

    it('regenerateCalendarImage on ARCHIVED is refused outright, no upload attempted', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ status: 'archived' }));
      await expectRejectionDetails(regenerateCalendarImage('day-1', publishedContext), /requires human review/);
      expect(mockBucketPut).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });

    it('regenerateCalendarImage on PUBLISHED does not restore/write anything if generation fails -- nothing was written to begin with', async () => {
      const published = calendarDay({ status: 'published', imageUrl: 'media/calendar/day-1/main/old.png' });
      mockGetCalendarDay.mockResolvedValue(published);
      mockListSaints.mockResolvedValue([]);
      mockGenerateTelegramImage.mockRejectedValue(new Error('OpenAI quota exceeded'));

      await expect(regenerateCalendarImage('day-1', publishedContext)).rejects.toThrow();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(mockCreateHumanAuthoredProposal).not.toHaveBeenCalled();
    });

    it('generateCalendarImageFromPrompt on PUBLISHED uploads to R2 but proposes the imageUrl instead of writing it', async () => {
      const published = calendarDay({ status: 'published', imageUrl: 'media/calendar/day-1/main/old.png' });
      mockGetCalendarDay.mockResolvedValue(published);

      const result = await generateCalendarImageFromPrompt('day-1', 'A specific illustration prompt', publishedContext);
      expectProposalMode(result);

      expect(mockBucketPut).toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(result.day).toEqual(published);
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
        publishedContext.request,
        'admin-1',
        'calendar',
        'day-1',
        expect.objectContaining({
          imageMetadata: expect.objectContaining({ customPrompt: 'A specific illustration prompt' }),
        }),
        expect.any(String),
      );
    });

    it('generateCalendarImageFromPrompt on ARCHIVED is refused outright, no upload attempted', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ status: 'archived' }));
      await expectRejectionDetails(generateCalendarImageFromPrompt('day-1', 'A prompt', publishedContext), /requires human review/);
      expect(mockGenerateTelegramImage).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });

    it('assignCalendarImage (manual media-library pick) is NOT gated by this rule -- it writes directly regardless of status, by design', async () => {
      mockGetCalendarDay.mockResolvedValue(calendarDay({ status: 'published' }));
      await assignCalendarImage('day-1', 'media/calendar/day-1/main/picked.png');
      expect(mockUpdateCalendarDay).toHaveBeenCalledWith('day-1', {
        imageUrl: 'media/calendar/day-1/main/picked.png',
        imageMetadata: null,
      });
    });
  });

  describe('fillMissingCalendarContent', () => {
    // Every fixture in this describe block is a DRAFT day (calendarDay()'s
    // own default), so these always take the direct-write path and never
    // actually read `request`/`adminUserId` on the shared module-level
    // draftContext -- the PUBLISHED-day proposal path has its own describe
    // block below.
    function expectDirect(result: FillMissingCalendarResult): asserts result is Extract<FillMissingCalendarResult, { mode: 'direct' }> {
      if (result.mode !== 'direct') throw new Error('expected a direct write, got a proposal');
    }

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

      const result = await fillMissingCalendarContent('day-1', draftContext);
      expectDirect(result);

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

      const result = await fillMissingCalendarContent('day-1', draftContext);
      expectDirect(result);

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

      const result = await fillMissingCalendarContent('day-1', draftContext);
      expectDirect(result);

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

      await fillMissingCalendarContent('day-1', draftContext);

      for (const call of mockUpdateCalendarDay.mock.calls) {
        expect(call[1]).not.toHaveProperty('status');
      }
    });
  });

  describe('fillMissingCalendarContent on a PUBLISHED day', () => {
    const publishedContext = { request: new Request('http://localhost/'), adminUserId: 'admin-1' };
    function expectProposal(result: FillMissingCalendarResult): asserts result is Extract<FillMissingCalendarResult, { mode: 'proposal' }> {
      if (result.mode !== 'proposal') throw new Error('expected a proposal, got a direct write');
    }

    it('never writes to the record -- computes the same candidate content and stages it as a human-authored proposal instead', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ status: 'published', description: '', history: 'Вже написано вручну', seoTitle: null, seoDescription: null, imageUrl: '' }),
      );
      mockListSaints.mockResolvedValue([]);
      mockGenerateChurchContent.mockImplementation(async (input: { kind: string }) => `generated-${input.kind}`);
      mockGenerateTelegramImage.mockResolvedValue({ bytes: new ArrayBuffer(4), mimeType: 'image/png' });

      const result = await fillMissingCalendarContent('day-1', publishedContext);
      expectProposal(result);

      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
      expect(result.proposedFields.sort()).toEqual(['description', 'image', 'seo']);
      expect(result.proposalId).toBe('proposal-1');
      expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledTimes(1);
      const [request, adminUserId, targetType, targetId, patch] = mockCreateHumanAuthoredProposal.mock.calls[0];
      expect(request).toBe(publishedContext.request);
      expect(adminUserId).toBe('admin-1');
      expect(targetType).toBe('calendar');
      expect(targetId).toBe('day-1');
      expect(patch).toMatchObject({ description: 'generated-description', seoTitle: 'generated-seo_title', seoDescription: 'generated-seo_description' });
      // history already had content -- never regenerated, never included in the proposal.
      expect(patch).not.toHaveProperty('history');
    });

    it('creates no proposal at all when nothing is missing', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({ status: 'published', description: 'x', history: 'x', seoTitle: 'x', seoDescription: 'x', imageUrl: 'media/calendar/day-1/main/x.png' }),
      );
      mockListSaints.mockResolvedValue([]);

      const result = await fillMissingCalendarContent('day-1', publishedContext);
      expectProposal(result);

      expect(result.proposalId).toBeNull();
      expect(result.proposedFields).toEqual([]);
      expect(mockCreateHumanAuthoredProposal).not.toHaveBeenCalled();
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });

    it('skips factual fields the same way a draft day would when saint verification fails, still never writing to the record', async () => {
      mockGetCalendarDay.mockResolvedValue(
        calendarDay({
          status: 'published',
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

      const result = await fillMissingCalendarContent('day-1', publishedContext);
      expectProposal(result);

      expect(result.skipped).toEqual(
        expect.arrayContaining([
          { field: 'description', reason: 'review_required' },
          { field: 'history', reason: 'review_required' },
          { field: 'seo', reason: 'review_required' },
        ]),
      );
      expect(mockGenerateChurchContent).not.toHaveBeenCalled();
      // Image safety doesn't depend on the saint-identity verification gate.
      expect(result.proposedFields).toContain('image');
      expect(mockUpdateCalendarDay).not.toHaveBeenCalled();
    });
  });

  it('never calls Telegram -- calendar-ai-actions.ts has no Telegram-sending import at all', () => {
    const source = readFileSync(join(__dirname, 'calendar-ai-actions.ts'), 'utf8');
    expect(source).not.toMatch(/sendAutopostMessage|TelegramClient|client\.sendMessage|client\.sendPhoto/);
  });
});
