import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchIconDto } from '@/lib/d1/repositories/icons';

const mockGetIcon = vi.fn();
const mockUpdateIcon = vi.fn();
const mockListIcons = vi.fn(async () => [] as ChurchIconDto[]);
vi.mock('@/lib/d1/repositories/icons', () => ({
  getIcon: mockGetIcon,
  updateIcon: mockUpdateIcon,
  listIcons: mockListIcons,
}));

const mockEditIconImage = vi.fn();
vi.mock('@/lib/ai/icon-image-edit', () => ({ editIconImage: mockEditIconImage }));

const mockBucketGet = vi.fn();
const mockBucketPut = vi.fn(async () => ({}));
vi.mock('@/lib/d1/env', () => ({ getMediaBucket: async () => ({ get: mockBucketGet, put: mockBucketPut }) }));

const mockGetOpenAiConfig = vi.fn(async () => ({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined }));
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: mockGetOpenAiConfig }));

/** createHumanAuthoredProposal() is dynamically imported by writeOrPropose()
 * (icon-ai-actions.ts) for a PUBLISHED icon -- mocked wholesale, same
 * convention as icon-ai-actions.test.ts. */
const mockCreateHumanAuthoredProposal = vi.fn(async (_request: Request, _adminUserId: string, _targetType: string, _targetId: string, patch: unknown) => ({
  id: 'proposal-1',
  status: 'pending',
  patch,
}));
vi.mock('@/lib/ai-access/proposals', () => ({ createHumanAuthoredProposal: mockCreateHumanAuthoredProposal }));

const { generateIconPortfolio, addIconPortfolioImages } = await import('./icon-portfolio-actions');

const MAIN_IMAGE_URL = 'media/icons/icon-1/main/11111111-1111-1111-1111-111111111111.png';

function icon(overrides: Partial<ChurchIconDto> = {}): ChurchIconDto {
  return {
    id: 'icon-1',
    siteId: 'site',
    calendarDayId: null,
    title: 'Ікона Св. Миколая',
    slug: 'svt-mykolaia',
    imageUrl: MAIN_IMAGE_URL,
    galleryUrls: [],
    galleryMetadata: {},
    saintName: 'Святитель Миколай',
    feastName: '',
    description: '',
    language: 'uk',
    translationGroupId: 'group-1',
    status: 'draft',
    isGlobal: false,
    orderEnabled: false,
    orderBlockText: '',
    productionTime: '',
    priceCents: null,
    currency: 'UAH',
    consecrationAvailable: false,
    history: null,
    saintImageDescription: null,
    materials: null,
    dimensions: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const context = { request: new Request('https://example.com'), adminUserId: 'admin-1' };

function sourceObject(bytes: ArrayBuffer = new ArrayBuffer(4), contentType = 'image/png') {
  return { arrayBuffer: async () => bytes, httpMetadata: { contentType } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined, imageModel: undefined });
  mockBucketGet.mockResolvedValue(sourceObject());
  mockBucketPut.mockResolvedValue({});
  mockEditIconImage.mockImplementation(async () => ({ bytes: new ArrayBuffer(8), mimeType: 'image/png' }));
});

describe('generateIconPortfolio', () => {
  it('refuses when the icon has no source photo yet', async () => {
    mockGetIcon.mockResolvedValue(icon({ imageUrl: '' }));
    await expect(generateIconPortfolio('icon-1')).rejects.toMatchObject({ status: 400 });
    expect(mockBucketGet).not.toHaveBeenCalled();
    expect(mockEditIconImage).not.toHaveBeenCalled();
  });

  it("refuses when the icon's imageUrl is not a valid media key", async () => {
    mockGetIcon.mockResolvedValue(icon({ imageUrl: 'not-a-real-media-key' }));
    await expect(generateIconPortfolio('icon-1')).rejects.toMatchObject({ status: 400 });
    expect(mockBucketGet).not.toHaveBeenCalled();
  });

  it('refuses when the source photo cannot be found in storage', async () => {
    mockGetIcon.mockResolvedValue(icon());
    mockBucketGet.mockResolvedValue(null);
    await expect(generateIconPortfolio('icon-1')).rejects.toMatchObject({ status: 400 });
    expect(mockEditIconImage).not.toHaveBeenCalled();
  });

  it('never writes to the church_icons row -- updateIcon is never called', async () => {
    mockGetIcon.mockResolvedValue(icon());
    await generateIconPortfolio('icon-1');
    expect(mockUpdateIcon).not.toHaveBeenCalled();
  });

  it('generates one candidate per preset, each at a brand-new key distinct from the source image and from each other', async () => {
    mockGetIcon.mockResolvedValue(icon());
    const result = await generateIconPortfolio('icon-1');

    expect(result.generated.length).toBeGreaterThanOrEqual(3);
    expect(result.skipped).toEqual([]);
    const keys = result.generated.map((g) => g.imageUrl);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).not.toBe(MAIN_IMAGE_URL);
      expect(key.startsWith('media/icons/icon-1/portfolio/')).toBe(true);
    }
  });

  it('carries the source image url forward as provenance on every generated candidate', async () => {
    mockGetIcon.mockResolvedValue(icon());
    const result = await generateIconPortfolio('icon-1');
    for (const candidate of result.generated) expect(candidate.sourceImageUrl).toBe(MAIN_IMAGE_URL);
  });

  it('passes the icon\'s own photo bytes/mime type into every image-edit call, never a different image', async () => {
    const bytes = new ArrayBuffer(16);
    mockGetIcon.mockResolvedValue(icon());
    mockBucketGet.mockResolvedValue(sourceObject(bytes, 'image/jpeg'));

    await generateIconPortfolio('icon-1');

    expect(mockEditIconImage).toHaveBeenCalled();
    for (const call of mockEditIconImage.mock.calls) {
      expect(call[0].sourceImageBytes).toBe(bytes);
      expect(call[0].sourceImageMimeType).toBe('image/jpeg');
    }
  });

  it("tolerates a single preset's failure without blocking the others", async () => {
    mockGetIcon.mockResolvedValue(icon());
    mockEditIconImage
      .mockRejectedValueOnce(new Error('OpenAI down'))
      .mockResolvedValue({ bytes: new ArrayBuffer(8), mimeType: 'image/png' });

    const result = await generateIconPortfolio('icon-1');

    expect(result.skipped).toEqual([{ preset: expect.any(String), reason: 'failed' }]);
    expect(result.generated.length).toBeGreaterThanOrEqual(2);
  });
});

describe('addIconPortfolioImages', () => {
  const validEntry = () => ({
    preset: 'table_candle' as const,
    imageUrl: 'media/icons/icon-1/portfolio/22222222-2222-2222-2222-222222222222.png',
    sourceImageUrl: MAIN_IMAGE_URL,
    generatedAt: '2026-01-02T00:00:00.000Z',
  });

  it('refuses with no entries', async () => {
    mockGetIcon.mockResolvedValue(icon());
    await expect(addIconPortfolioImages('icon-1', [], context)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an image key belonging to a DIFFERENT icon's portfolio namespace (forged/mismatched url)", async () => {
    mockGetIcon.mockResolvedValue(icon());
    const forged = { ...validEntry(), imageUrl: 'media/icons/icon-OTHER/portfolio/22222222-2222-2222-2222-222222222222.png' };
    await expect(addIconPortfolioImages('icon-1', [forged], context)).rejects.toMatchObject({ status: 400 });
    expect(mockUpdateIcon).not.toHaveBeenCalled();
  });

  it("rejects an image key under this icon's 'main' purpose instead of 'portfolio'", async () => {
    mockGetIcon.mockResolvedValue(icon());
    const wrongPurpose = { ...validEntry(), imageUrl: MAIN_IMAGE_URL };
    await expect(addIconPortfolioImages('icon-1', [wrongPurpose], context)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an entry with an unrecognized preset', async () => {
    mockGetIcon.mockResolvedValue(icon());
    const bogus = { ...validEntry(), preset: 'bogus' as unknown as 'table_candle' };
    await expect(addIconPortfolioImages('icon-1', [bogus], context)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an entry whose sourceImageUrl is not a valid media key', async () => {
    mockGetIcon.mockResolvedValue(icon());
    const badSource = { ...validEntry(), sourceImageUrl: 'javascript:alert(1)' };
    await expect(addIconPortfolioImages('icon-1', [badSource], context)).rejects.toMatchObject({ status: 400 });
  });

  it('merges accepted entries into galleryUrls/galleryMetadata and writes directly on a DRAFT icon', async () => {
    mockGetIcon.mockResolvedValue(icon({ status: 'draft' }));
    mockUpdateIcon.mockResolvedValue(icon());
    const entry = validEntry();

    const result = await addIconPortfolioImages('icon-1', [entry], context);

    expect(mockUpdateIcon).toHaveBeenCalledWith('icon-1', {
      galleryUrls: [entry.imageUrl],
      galleryMetadata: {
        [entry.imageUrl]: {
          origin: 'ai_generated_portfolio',
          sourceImageUrl: entry.sourceImageUrl,
          preset: entry.preset,
          generatedAt: entry.generatedAt,
        },
      },
    });
    expect(result).toMatchObject({ mode: 'direct' });
    expect(mockCreateHumanAuthoredProposal).not.toHaveBeenCalled();
  });

  it('never includes imageUrl (the main photo) in the write patch', async () => {
    mockGetIcon.mockResolvedValue(icon({ status: 'draft' }));
    mockUpdateIcon.mockResolvedValue(icon());
    await addIconPortfolioImages('icon-1', [validEntry()], context);
    const patch = mockUpdateIcon.mock.calls[0][1];
    expect(patch).not.toHaveProperty('imageUrl');
  });

  it('does not duplicate an already-present gallery url', async () => {
    const entry = validEntry();
    mockGetIcon.mockResolvedValue(icon({ status: 'draft', galleryUrls: [entry.imageUrl] }));
    mockUpdateIcon.mockResolvedValue(icon());

    await addIconPortfolioImages('icon-1', [entry], context);

    const patch = mockUpdateIcon.mock.calls[0][1];
    expect(patch.galleryUrls).toEqual([entry.imageUrl]);
  });

  it('preserves existing gallery metadata for photos not part of this request', async () => {
    const existingKey = 'media/icons/icon-1/portfolio/33333333-3333-3333-3333-333333333333.png';
    const entry = validEntry();
    mockGetIcon.mockResolvedValue(icon({
      status: 'draft',
      galleryUrls: [existingKey],
      galleryMetadata: { [existingKey]: { origin: 'ai_generated_portfolio', sourceImageUrl: MAIN_IMAGE_URL, preset: 'in_hand', generatedAt: '2026-01-01T00:00:00.000Z' } },
    }));
    mockUpdateIcon.mockResolvedValue(icon());

    await addIconPortfolioImages('icon-1', [entry], context);

    const patch = mockUpdateIcon.mock.calls[0][1];
    expect(patch.galleryMetadata[existingKey]).toBeDefined();
    expect(patch.galleryUrls).toEqual([existingKey, entry.imageUrl]);
  });

  it('on a PUBLISHED icon never writes directly -- creates a human-authored proposal instead', async () => {
    mockGetIcon.mockResolvedValue(icon({ status: 'published' }));
    const entry = validEntry();

    const result = await addIconPortfolioImages('icon-1', [entry], context);

    expect(mockUpdateIcon).not.toHaveBeenCalled();
    expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
      context.request, 'admin-1', 'icons', 'icon-1',
      { galleryUrls: [entry.imageUrl], galleryMetadata: { [entry.imageUrl]: { origin: 'ai_generated_portfolio', sourceImageUrl: entry.sourceImageUrl, preset: entry.preset, generatedAt: entry.generatedAt } } },
      expect.any(String),
    );
    expect(result).toMatchObject({ mode: 'proposal', proposalId: 'proposal-1' });
  });

  it('refuses automatic edits for a non-draft, non-published status (e.g. archived)', async () => {
    mockGetIcon.mockResolvedValue(icon({ status: 'archived' }));
    await expect(addIconPortfolioImages('icon-1', [validEntry()], context)).rejects.toMatchObject({ status: 403 });
  });
});
