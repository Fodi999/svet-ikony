import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchIconDto } from '@/lib/d1/repositories/icons';
import type { ChurchProductDto } from '@/lib/d1/repositories/products';

const mockGetProduct = vi.fn();
const mockUpdateProduct = vi.fn();
vi.mock('@/lib/d1/repositories/products', () => ({
  getProduct: mockGetProduct,
  updateProduct: mockUpdateProduct,
}));

const mockListIcons = vi.fn(async () => [] as ChurchIconDto[]);
vi.mock('@/lib/d1/repositories/icons', () => ({ listIcons: mockListIcons }));

const mockGenerateProductContent = vi.fn();
vi.mock('@/lib/ai/product-content', () => ({ generateProductContent: mockGenerateProductContent }));

const mockGetOpenAiConfig = vi.fn(async () => ({ apiKey: 'fake-openai-key', model: undefined }));
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: mockGetOpenAiConfig }));

/** createHumanAuthoredProposal() is dynamically imported by writeOrPropose()
 * for an active (published) product -- mocked wholesale here so these
 * tests stay unit-scoped to product-ai-actions.ts, same convention as
 * icon-ai-actions.test.ts. */
const mockCreateHumanAuthoredProposal = vi.fn(async (_request: Request, _adminUserId: string, _targetType: string, _targetId: string, patch: unknown) => ({
  id: 'proposal-1',
  status: 'pending',
  patch,
}));
vi.mock('@/lib/ai-access/proposals', () => ({ createHumanAuthoredProposal: mockCreateHumanAuthoredProposal }));

const {
  fillMissingProductContent,
  generateProductFullDescription,
  generateProductSeoTitle,
  generateProductSeoDescription,
  regenerateProductFullDescription,
} = await import('./product-ai-actions');

function product(overrides: Partial<ChurchProductDto> = {}): ChurchProductDto {
  return {
    id: 'product-1',
    siteId: 'site',
    slug: 'ikona-mykolaya',
    nameUk: 'Ікона Миколая',
    nameRu: 'Икона Николая',
    nameEn: 'Icon of Nicholas',
    description: 'Плоский опис',
    categoryId: 'cat-icons',
    linkedIconTranslationGroupId: 'icon-mykolai',
    fullDescriptionUk: '',
    fullDescriptionRu: '',
    fullDescriptionEn: '',
    galleryUrls: [],
    photoUrl: '',
    priceCents: 150000,
    currency: 'UAH',
    productionTime: '7-10 днів',
    consecrationAvailable: true,
    stockStatus: 'available',
    featured: false,
    seoTitleUk: '',
    seoTitleRu: '',
    seoTitleEn: '',
    seoDescriptionUk: '',
    seoDescriptionRu: '',
    seoDescriptionEn: '',
    isActive: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function icon(overrides: Partial<ChurchIconDto> = {}): ChurchIconDto {
  return {
    id: 'icon-mykolai-uk',
    siteId: 'site',
    calendarDayId: null,
    title: 'Ікона Миколая Чудотворця',
    slug: 'mykolai-chudotvorets',
    imageUrl: '',
    galleryUrls: [],
    galleryMetadata: {},
    saintName: 'Святитель Миколай',
    feastName: 'День святого Миколая',
    description: 'Образ святителя Миколая.',
    language: 'uk',
    translationGroupId: 'icon-mykolai',
    status: 'published',
    isGlobal: false,
    orderEnabled: false,
    orderBlockText: '',
    productionTime: '',
    priceCents: null,
    currency: 'UAH',
    consecrationAvailable: false,
    history: 'Ікону шанують з давніх часів.',
    saintImageDescription: 'Святий зображений з хрестом і Євангелієм.',
    materials: 'Дерево, левкас, темпера',
    dimensions: '30x40 см',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const context = { request: new Request('https://example.com'), adminUserId: 'admin-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined });
  mockListIcons.mockResolvedValue([icon()]);
});

describe('generateProductFullDescription / regenerateProductFullDescription', () => {
  it('refuses when the product has no linked icon', async () => {
    mockGetProduct.mockResolvedValue(product({ linkedIconTranslationGroupId: null }));
    await expect(generateProductFullDescription('product-1', 'uk', context)).rejects.toMatchObject({ status: 400 });
    expect(mockGenerateProductContent).not.toHaveBeenCalled();
  });

  it("refuses when the linked icon group no longer exists (icon deleted after linking)", async () => {
    mockGetProduct.mockResolvedValue(product({ linkedIconTranslationGroupId: 'icon-mykolai' }));
    mockListIcons.mockResolvedValue([]); // no icon in this group anymore
    await expect(generateProductFullDescription('product-1', 'uk', context)).rejects.toMatchObject({ status: 400 });
    expect(mockGenerateProductContent).not.toHaveBeenCalled();
  });

  it('refuses to generate when the field already has content', async () => {
    mockGetProduct.mockResolvedValue(product({ fullDescriptionUk: 'Вже є опис' }));
    await expect(generateProductFullDescription('product-1', 'uk', context)).rejects.toMatchObject({ status: 409 });
    expect(mockGenerateProductContent).not.toHaveBeenCalled();
  });

  it('generates and writes directly on an inactive (draft-like) product', async () => {
    mockGetProduct.mockResolvedValue(product({ isActive: false, fullDescriptionUk: '' }));
    mockGenerateProductContent.mockResolvedValue('Новий опис товару.');
    mockUpdateProduct.mockResolvedValue(product({ fullDescriptionUk: 'Новий опис товару.' }));

    const result = await generateProductFullDescription('product-1', 'uk', context);

    expect(mockUpdateProduct).toHaveBeenCalledWith('product-1', { fullDescriptionUk: 'Новий опис товару.' });
    expect(result).toMatchObject({ mode: 'direct' });
    expect(mockCreateHumanAuthoredProposal).not.toHaveBeenCalled();
  });

  it('on an active (published) product never writes directly -- creates a proposal instead', async () => {
    mockGetProduct.mockResolvedValue(product({ isActive: true, fullDescriptionUk: '' }));
    mockGenerateProductContent.mockResolvedValue('Опис для публікації.');

    const result = await regenerateProductFullDescription('product-1', 'uk', context);

    expect(mockUpdateProduct).not.toHaveBeenCalled();
    expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
      context.request, 'admin-1', 'products', 'product-1', { fullDescriptionUk: 'Опис для публікації.' }, expect.any(String),
    );
    expect(result).toMatchObject({ mode: 'proposal', proposalId: 'proposal-1' });
  });

  it('uses the linked icon as the sole factual source -- facts include saintName/description/history/materials/dimensions', async () => {
    mockGetProduct.mockResolvedValue(product({ fullDescriptionUk: '' }));
    mockGenerateProductContent.mockResolvedValue('Опис.');
    mockUpdateProduct.mockResolvedValue(product({ fullDescriptionUk: 'Опис.' }));

    await generateProductFullDescription('product-1', 'uk', context);

    const call = mockGenerateProductContent.mock.calls[0][0];
    expect(call.facts).toContain('Святитель Миколай');
    expect(call.facts).toContain('Образ святителя Миколая.');
    expect(call.facts).toContain('Ікону шанують з давніх часів.');
    expect(call.facts).toContain('Дерево, левкас, темпера');
    expect(call.facts).toContain('30x40 см');
  });

  it('never sends the product\'s own commercial facts (price/production time/consecration) to the AI', async () => {
    mockGetProduct.mockResolvedValue(product({ fullDescriptionUk: '', priceCents: 999999, productionTime: '99 днів', consecrationAvailable: true }));
    mockGenerateProductContent.mockResolvedValue('Опис.');
    mockUpdateProduct.mockResolvedValue(product({ fullDescriptionUk: 'Опис.' }));

    await generateProductFullDescription('product-1', 'uk', context);

    const call = mockGenerateProductContent.mock.calls[0][0];
    expect(call.facts).not.toContain('999999');
    expect(call.facts).not.toContain('99 днів');
    expect(JSON.stringify(call)).not.toContain('consecrat');
  });

  it('rejects a generated text that fails the language guard, writing nothing', async () => {
    mockGetProduct.mockResolvedValue(product({ fullDescriptionUk: '' }));
    mockGenerateProductContent.mockResolvedValue('This is plain English text with no Ukrainian at all.');

    await expect(generateProductFullDescription('product-1', 'uk', context)).rejects.toMatchObject({ status: 400 });
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });

  it('falls back to a sibling language icon row when the requested language has no facts', async () => {
    mockGetProduct.mockResolvedValue(product({ fullDescriptionRu: '' }));
    mockListIcons.mockResolvedValue([
      icon({ id: 'icon-mykolai-uk', language: 'uk', saintName: 'Святитель Миколай', description: 'УК опис' }),
      icon({ id: 'icon-mykolai-ru', language: 'ru', saintName: '', feastName: '', description: '', history: null, saintImageDescription: null, materials: '', dimensions: '' }),
    ]);
    mockGenerateProductContent.mockResolvedValue('Русский текст.');
    mockUpdateProduct.mockResolvedValue(product({ fullDescriptionRu: 'Русский текст.' }));

    await generateProductFullDescription('product-1', 'ru', context);

    const call = mockGenerateProductContent.mock.calls[0][0];
    expect(call.facts).toContain('Святитель Миколай');
  });
});

describe('generateProductSeoTitle / generateProductSeoDescription -- never touch protected commercial fields', () => {
  const PROTECTED_KEYS = ['priceCents', 'currency', 'stockStatus', 'productionTime', 'consecrationAvailable', 'isActive', 'featured', 'sortOrder', 'nameUk', 'nameRu', 'nameEn', 'slug', 'categoryId', 'photoUrl', 'galleryUrls'];

  it('generateProductSeoTitle patch contains only seoTitleUk, nothing else', async () => {
    mockGetProduct.mockResolvedValue(product({ seoTitleUk: '' }));
    mockGenerateProductContent.mockResolvedValue('Заголовок.');
    mockUpdateProduct.mockResolvedValue(product({ seoTitleUk: 'Заголовок.' }));

    await generateProductSeoTitle('product-1', 'uk', context);

    const patch = mockUpdateProduct.mock.calls[0][1];
    expect(Object.keys(patch)).toEqual(['seoTitleUk']);
    for (const key of PROTECTED_KEYS) expect(patch).not.toHaveProperty(key);
  });

  it('generateProductSeoDescription patch contains only seoDescriptionUk, nothing else', async () => {
    mockGetProduct.mockResolvedValue(product({ seoDescriptionUk: '' }));
    mockGenerateProductContent.mockResolvedValue('SEO опис.');
    mockUpdateProduct.mockResolvedValue(product({ seoDescriptionUk: 'SEO опис.' }));

    await generateProductSeoDescription('product-1', 'uk', context);

    const patch = mockUpdateProduct.mock.calls[0][1];
    expect(Object.keys(patch)).toEqual(['seoDescriptionUk']);
    for (const key of PROTECTED_KEYS) expect(patch).not.toHaveProperty(key);
  });
});

describe('fillMissingProductContent', () => {
  it('refuses when the product has no linked icon', async () => {
    mockGetProduct.mockResolvedValue(product({ linkedIconTranslationGroupId: null }));
    await expect(fillMissingProductContent('product-1', context)).rejects.toMatchObject({ status: 400 });
    expect(mockGenerateProductContent).not.toHaveBeenCalled();
  });

  it('fills every missing field across all three languages and leaves already-filled fields untouched', async () => {
    mockGetProduct.mockResolvedValue(product({
      fullDescriptionUk: '', fullDescriptionRu: '', fullDescriptionEn: 'Already there',
      seoTitleUk: '', seoTitleRu: 'Already there', seoTitleEn: '',
      seoDescriptionUk: 'Already there', seoDescriptionRu: '', seoDescriptionEn: '',
    }));
    mockGenerateProductContent.mockResolvedValue('Generated.');
    mockUpdateProduct.mockImplementation(async (_id, patch) => product(patch));

    const result = await fillMissingProductContent('product-1', context);

    expect(result.mode).toBe('direct');
    if (result.mode !== 'direct') throw new Error('unreachable');
    // 9 fields total, 3 already filled -> exactly 6 filled, 0 skipped.
    expect(result.filled).toHaveLength(6);
    expect(result.filled).not.toContain('fullDescriptionEn');
    expect(result.filled).not.toContain('seoTitleRu');
    expect(result.filled).not.toContain('seoDescriptionUk');
    expect(result.skipped).toEqual([]);

    const patch = mockUpdateProduct.mock.calls[0][1];
    expect(patch).not.toHaveProperty('fullDescriptionEn');
    expect(patch).not.toHaveProperty('seoTitleRu');
    expect(patch).not.toHaveProperty('seoDescriptionUk');
  });

  it('reports nothing filled when every field already has content', async () => {
    mockGetProduct.mockResolvedValue(product({
      fullDescriptionUk: 'x', fullDescriptionRu: 'x', fullDescriptionEn: 'x',
      seoTitleUk: 'x', seoTitleRu: 'x', seoTitleEn: 'x',
      seoDescriptionUk: 'x', seoDescriptionRu: 'x', seoDescriptionEn: 'x',
    }));

    const result = await fillMissingProductContent('product-1', context);

    expect(mockGenerateProductContent).not.toHaveBeenCalled();
    expect(mockUpdateProduct).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: 'direct', filled: [], skipped: [] });
  });

  it('reports a per-field failure without blocking the other fields from being filled', async () => {
    mockGetProduct.mockResolvedValue(product({
      fullDescriptionUk: '', fullDescriptionRu: 'x', fullDescriptionEn: 'x',
      seoTitleUk: 'x', seoTitleRu: 'x', seoTitleEn: '',
      seoDescriptionUk: 'x', seoDescriptionRu: 'x', seoDescriptionEn: 'x',
    }));
    mockGenerateProductContent
      .mockRejectedValueOnce(new Error('OpenAI down'))
      .mockResolvedValueOnce('EN SEO title.');
    mockUpdateProduct.mockImplementation(async (_id, patch) => product(patch));

    const result = await fillMissingProductContent('product-1', context);

    expect(result).toMatchObject({
      mode: 'direct',
      filled: ['seoTitleEn'],
      skipped: [{ field: 'fullDescriptionUk', reason: 'failed' }],
    });
  });

  it('on an active (published) product never writes to the record -- stages a human-authored proposal instead', async () => {
    mockGetProduct.mockResolvedValue(product({ isActive: true, fullDescriptionUk: '', fullDescriptionRu: '', fullDescriptionEn: '', seoTitleUk: '', seoTitleRu: '', seoTitleEn: '', seoDescriptionUk: '', seoDescriptionRu: '', seoDescriptionEn: '' }));
    mockGenerateProductContent.mockResolvedValue('Текст.');

    const result = await fillMissingProductContent('product-1', context);

    expect(mockUpdateProduct).not.toHaveBeenCalled();
    expect(mockCreateHumanAuthoredProposal).toHaveBeenCalled();
    expect(result).toMatchObject({ mode: 'proposal', proposalId: 'proposal-1' });
  });
});
