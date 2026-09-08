import { describe, expect, it, vi } from 'vitest';
import type {
  Church,
  ChurchAlphabetLetterDto,
  ChurchProductDto,
  Icon,
  Prayer,
  PublicChurchSitemapItem,
  Saint
} from '@/lib/types';

/**
 * PHASE MULTILINGUAL-1 / P0.7. Mocks `publicApi` entirely (no real D1/HTTP)
 * so this exercises `app/sitemap.ts`'s own per-entity policy logic in
 * isolation -- the exact rule documented in that file's comments for each
 * entity type. The core assertion repeated for every entity: the sitemap
 * must never advertise a URL for a (locale, item) pair that has no real
 * published content there.
 */

const mockPublicApi = vi.hoisted(() => ({
  saints: vi.fn(),
  churches: vi.fn(),
  churchSitemap: vi.fn(),
  icons: vi.fn(),
  prayers: vi.fn(),
  churchAlphabetList: vi.fn(),
  products: vi.fn()
}));

vi.mock('@/lib/api', () => ({ publicApi: mockPublicApi }));

function saint(overrides: Partial<Saint> = {}): Saint {
  return {
    id: 'id-1',
    slug: 'varvara',
    name: 'Varvara',
    shortDescription: '',
    biography: '',
    feastDayOldStyle: '',
    feastDayNewStyle: '',
    imageUrl: '',
    relatedIcons: [],
    prayers: [],
    status: 'published',
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'church',
    ...overrides
  };
}

function icon(overrides: Partial<Icon> = {}): Icon {
  return {
    id: 'icon-1',
    slug: 'spas',
    title: 'Spas',
    shortDescription: '',
    prayerText: '',
    imageUrl: '',
    category: '',
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as Icon;
}

function prayer(overrides: Partial<Prayer> = {}): Prayer {
  return {
    id: 'prayer-1',
    slug: 'otche-nash',
    title: 'Otche Nash',
    text: '',
    category: '',
    status: 'published',
    source: 'church',
    ...overrides
  } as Prayer;
}

function letter(overrides: Partial<ChurchAlphabetLetterDto> = {}): ChurchAlphabetLetterDto {
  return {
    id: 'letter-1',
    letter: 'А',
    name: 'Азъ',
    slug: 'az',
    sortOrder: 1,
    status: 'published',
    updatedAt: '2026-01-01T00:00:00.000Z',
    language: 'uk'
  } as ChurchAlphabetLetterDto;
}

function sitemapItem(overrides: Partial<PublicChurchSitemapItem> = {}): PublicChurchSitemapItem {
  return {
    kind: 'article',
    slug: 'some-article',
    updatedAt: '2026-01-01T00:00:00.000Z',
    language: 'uk',
    ...overrides
  };
}

function product(overrides: Partial<ChurchProductDto> = {}): ChurchProductDto {
  return {
    id: 'product-1',
    siteId: 'site-1',
    slug: 'candle',
    nameUk: 'Свічка',
    nameRu: '',
    nameEn: '',
    description: '',
    categoryId: null,
    linkedIconTranslationGroupId: null,
    fullDescriptionUk: '',
    fullDescriptionRu: '',
    fullDescriptionEn: '',
    galleryUrls: [],
    photoUrl: '',
    priceCents: 100,
    currency: 'UAH',
    productionTime: '',
    consecrationAvailable: false,
    stockStatus: 'available',
    featured: false,
    seoTitleUk: '',
    seoTitleRu: '',
    seoTitleEn: '',
    seoDescriptionUk: '',
    seoDescriptionRu: '',
    seoDescriptionEn: '',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function church(overrides: Partial<Church> = {}): Church {
  return {
    id: 'church-1',
    slug: 'holy-trinity',
    title: 'Holy Trinity',
    city: 'Kyiv',
    address: '',
    description: '',
    schedule: '',
    status: 'published',
    ...overrides
  } as Church;
}

/** Every test that doesn't care about a given entity gets an empty/no-op
 * default so it doesn't have to restate the whole mock surface. */
function setDefaults() {
  mockPublicApi.saints.mockResolvedValue([]);
  mockPublicApi.churches.mockResolvedValue([]);
  mockPublicApi.churchSitemap.mockResolvedValue([]);
  mockPublicApi.icons.mockResolvedValue([]);
  mockPublicApi.prayers.mockResolvedValue([]);
  mockPublicApi.churchAlphabetList.mockResolvedValue([]);
  mockPublicApi.products.mockResolvedValue([]);
}

async function runSitemap() {
  vi.resetModules();
  const { default: sitemap } = await import('./sitemap');
  return sitemap();
}

describe('app/sitemap.ts (PHASE MULTILINGUAL-1 / P0.7)', () => {
  it('saints: fetched per locale, a translated: false fallback row is excluded, a genuinely-untranslated saint gets no ru/en URL', async () => {
    setDefaults();
    mockPublicApi.saints.mockImplementation(async (locale: string) => {
      if (locale === 'uk') return [saint({ slug: 'varvara', translated: true })];
      if (locale === 'ru') return [saint({ slug: 'varvara-ru', translated: true })];
      // en: no real translation -- the API substitutes an untranslated
      // same-slug fallback row, which must NOT get a sitemap URL.
      if (locale === 'en') return [saint({ slug: 'varvara', translated: false })];
      return [];
    });

    const urls = (await runSitemap()).map((entry) => entry.url);

    expect(urls).toContain('https://svetikony.com/uk/saints/varvara');
    expect(urls).toContain('https://svetikony.com/ru/saints/varvara-ru');
    expect(urls).not.toContain('https://svetikony.com/en/saints/varvara');
    expect(urls.filter((url) => url.includes('/en/saints/'))).toHaveLength(0);
  });

  it('icons/prayers: an untranslated (translated: false) fallback row is still excluded (verifies the pre-existing P0.2 fix is intact)', async () => {
    setDefaults();
    mockPublicApi.icons.mockImplementation(async (locale: string) =>
      locale === 'uk' ? [icon({ slug: 'spas', translated: true, updatedAt: '2026-01-01T00:00:00.000Z' })] : [icon({ slug: 'spas', translated: false })]
    );

    const urls = (await runSitemap()).map((entry) => entry.url);

    expect(urls).toContain('https://svetikony.com/uk/icons/spas');
    expect(urls).not.toContain('https://svetikony.com/ru/icons/spas');
    expect(urls).not.toContain('https://svetikony.com/en/icons/spas');
  });

  it('alphabet letters: only locales with a real published row get a URL', async () => {
    setDefaults();
    mockPublicApi.churchAlphabetList.mockImplementation(async (locale: string) =>
      locale === 'uk' ? [letter({ slug: 'az', language: 'uk' })] : []
    );

    const urls = (await runSitemap()).map((entry) => entry.url);

    expect(urls).toContain('https://svetikony.com/uk/staroslavyanskaya-azbuka/az');
    expect(urls).not.toContain('https://svetikony.com/ru/staroslavyanskaya-azbuka/az');
    expect(urls).not.toContain('https://svetikony.com/en/staroslavyanskaya-azbuka/az');
  });

  it('churchItems (calendar/gospel/article): one URL per row at that row\'s own language -- never a locales.map(...) fan-out for a uk-only row', async () => {
    setDefaults();
    mockPublicApi.churchSitemap.mockResolvedValue([
      sitemapItem({ kind: 'article', slug: 'only-uk-article', language: 'uk' }),
      sitemapItem({ kind: 'gospel', slug: 'gospel-reading', language: 'ru' })
    ]);

    const urls = (await runSitemap()).map((entry) => entry.url);

    expect(urls).toContain('https://svetikony.com/uk/church/articles/only-uk-article');
    expect(urls).not.toContain('https://svetikony.com/ru/church/articles/only-uk-article');
    expect(urls).not.toContain('https://svetikony.com/en/church/articles/only-uk-article');

    expect(urls).toContain('https://svetikony.com/ru/church/gospel/gospel-reading');
    expect(urls).not.toContain('https://svetikony.com/uk/church/gospel/gospel-reading');
  });

  it('churchItems: icon/prayer/saint kinds are excluded entirely (icons/prayers/saints are each handled by their own dedicated, translation-aware branch -- keeping them here would duplicate URLs and reintroduce the unconditional fan-out bug)', async () => {
    setDefaults();
    mockPublicApi.churchSitemap.mockResolvedValue([
      sitemapItem({ kind: 'icon', slug: 'should-not-appear-here', language: 'uk' }),
      sitemapItem({ kind: 'prayer', slug: 'should-not-appear-here-either', language: 'uk' }),
      sitemapItem({ kind: 'saint', slug: 'duplicate-saint', language: 'uk' })
    ]);
    mockPublicApi.saints.mockImplementation(async (locale: string) => (locale === 'uk' ? [saint({ slug: 'duplicate-saint' })] : []));

    const urls = (await runSitemap()).map((entry) => entry.url);
    const saintUrls = urls.filter((url) => url.includes('duplicate-saint'));

    // Exactly one entry for this saint (from the saints branch), not two.
    expect(saintUrls).toEqual(['https://svetikony.com/uk/saints/duplicate-saint']);
    expect(urls).not.toContain('https://svetikony.com/uk/icons/should-not-appear-here');
    expect(urls).not.toContain('https://svetikony.com/uk/prayers/should-not-appear-here-either');
  });

  it('products: single-row-multi-column policy -- only locales whose name column is genuinely non-empty get a URL, all pointing at the same slug', async () => {
    setDefaults();
    mockPublicApi.products.mockResolvedValue([
      product({ slug: 'candle', nameUk: 'Свічка', nameRu: 'Свеча', nameEn: '' })
    ]);

    const urls = (await runSitemap()).map((entry) => entry.url);

    expect(urls).toContain('https://svetikony.com/uk/shop/candle');
    expect(urls).toContain('https://svetikony.com/ru/shop/candle');
    expect(urls).not.toContain('https://svetikony.com/en/shop/candle');
  });

  it('churches: no per-language field exists on this legacy entity, so all 3 locales are advertised (documented, currently-moot policy -- publicApi.churches() itself always resolves empty since /api/content was retired)', async () => {
    setDefaults();
    mockPublicApi.churches.mockResolvedValue([church({ slug: 'holy-trinity' })]);

    const urls = (await runSitemap()).map((entry) => entry.url);

    expect(urls).toContain('https://svetikony.com/uk/churches#holy-trinity');
    expect(urls).toContain('https://svetikony.com/ru/churches#holy-trinity');
    expect(urls).toContain('https://svetikony.com/en/churches#holy-trinity');
  });

  it('static pages still fan out to all 3 locales unconditionally (they always render something per locale)', async () => {
    setDefaults();
    const urls = (await runSitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://svetikony.com/uk/icons');
    expect(urls).toContain('https://svetikony.com/ru/icons');
    expect(urls).toContain('https://svetikony.com/en/icons');
  });
});
