import { describe, expect, it } from 'vitest';
import { buildCalendarHero, calendarDayFromChurchPage, dedupeCalendarDaysByDay, monthIndexFromCalendarTitle, resolveCategoryImage, resolveProductImages } from './api';
import type { ChurchProductCategoryDto, ChurchProductDto, PublicChurchContentPage } from './types';

describe('buildCalendarHero / monthIndexFromCalendarTitle round-trip', () => {
  it('produces a monthTitle that parses back to the same month for every month of the year', () => {
    for (let month = 1; month <= 12; month++) {
      const hero = buildCalendarHero(2026, month);
      expect(monthIndexFromCalendarTitle(hero.monthTitle)).toBe(month);
    }
  });

  it('carries the requested year', () => {
    expect(buildCalendarHero(2027, 3).year).toBe('2027');
  });

  it('uses a full month title that the client calendar can parse', () => {
    expect(buildCalendarHero(2026, 12).monthTitle).toBe('Декабрь 2026');
  });

  it('leaves the never-rendered fields blank rather than inventing values', () => {
    const hero = buildCalendarHero(2026, 1);
    expect(hero.title).toBe('');
    expect(hero.featureTitle).toBe('');
    expect(hero.iconDayIconSlug).toBe('');
  });
});

function samplePage(overrides: Partial<PublicChurchContentPage['calendarDay']> = {}): PublicChurchContentPage {
  return {
    calendarDay: {
      id: 'day-1',
      siteId: 'site-1',
      dateOldStyle: null,
      dateNewStyle: '2026-08-19',
      calendarType: 'both',
      title: 'Преображення',
      dayType: 'feast',
      description: 'desc',
      rank: 1,
      status: 'published',
      isGlobal: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
    icons: [],
    prayers: [],
    articles: [],
    gospel: [],
  };
}

describe('calendarDayFromChurchPage', () => {
  it('derives the day number from the new-style date', () => {
    const day = calendarDayFromChurchPage(samplePage());
    expect(day.day).toBe('19');
    expect(day.gregorianDate).toBe('2026-08-19');
  });

  it('marks a feast day as a feast', () => {
    const day = calendarDayFromChurchPage(samplePage({ dayType: 'feast' }));
    expect(day.feast).toBe(true);
  });

  it('falls back to old-style date when new-style is absent', () => {
    const day = calendarDayFromChurchPage(samplePage({ dateNewStyle: null, dateOldStyle: '2026-08-06' }));
    expect(day.day).toBe('06');
    expect(day.julianDate).toBe('2026-08-06');
  });

  it('builds detailHref from the date, matching the church-calendar route', () => {
    const day = calendarDayFromChurchPage(samplePage());
    expect(day.detailHref).toBe('/church/calendar/2026-08-19');
  });

  it('is textOnly when no icon is attached', () => {
    const day = calendarDayFromChurchPage(samplePage());
    expect(day.textOnly).toBe(true);
    expect(day.imageUrl).toBe('');
  });

  it('uses the calendar day\'s own photo (Stage 2H) over a related icon\'s image, resolving a bare R2 key to an absolute URL', () => {
    const day = calendarDayFromChurchPage(
      samplePage({ imageUrl: 'media/calendar/day-1/main/uuid.png' }),
    );
    expect(day.imageUrl).toContain('/media/calendar/day-1/main/uuid.png');
    expect(day.textOnly).toBe(false);
  });

  it('falls back to a related icon\'s image when the calendar day has no photo of its own', () => {
    const page = samplePage();
    page.icons = [
      {
        id: 'icon-1',
        siteId: 'site-1',
        title: 'Ікона',
        slug: 'icon-1',
        imageUrl: 'https://example.com/icon.jpg',
        saintName: '',
        feastName: '',
        description: '',
        language: 'uk',
        translationGroupId: 'group-1',
        status: 'published',
        isGlobal: false,
        orderEnabled: false,
        orderBlockText: '',
        productionTime: '',
        currency: 'UAH',
        consecrationAvailable: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const day = calendarDayFromChurchPage(page);
    expect(day.imageUrl).toBe('https://example.com/icon.jpg');
  });
});

describe('dedupeCalendarDaysByDay', () => {
  it('keeps the richer duplicate calendar day so an empty duplicate cannot remove a photo after hydration', () => {
    const emptyDuplicate = calendarDayFromChurchPage(samplePage({
      id: 'test-duplicate',
      dateNewStyle: '2026-12-17',
      title: 'Test after user report',
      imageUrl: '',
      description: '',
    }));
    const dayWithPhoto = calendarDayFromChurchPage(samplePage({
      id: 'varvara',
      dateNewStyle: '2026-12-17',
      title: 'Свята великомучениця Варвара',
      imageUrl: 'media/calendar/draft/main/ba711647-2228-4f24-8e8d-934b8ae08c59.png',
      description: 'День пам’яті святої великомучениці Варвари',
    }));

    const [merged] = dedupeCalendarDaysByDay([dayWithPhoto, emptyDuplicate]);
    const [mergedReversed] = dedupeCalendarDaysByDay([emptyDuplicate, dayWithPhoto]);

    expect(merged.id).toBe('varvara');
    expect(merged.imageUrl).toContain('/media/calendar/draft/main/ba711647-2228-4f24-8e8d-934b8ae08c59.png');
    expect(merged.textOnly).toBe(false);
    expect(mergedReversed.id).toBe('varvara');
    expect(mergedReversed.imageUrl).toBe(merged.imageUrl);
  });
});

function sampleProduct(overrides: Partial<ChurchProductDto> = {}): ChurchProductDto {
  return {
    id: 'product-1',
    siteId: 'site-1',
    slug: 'ikona-mykolaya',
    nameUk: 'Ікона Миколая',
    nameRu: '',
    nameEn: '',
    description: 'desc',
    categoryId: null,
    linkedIconTranslationGroupId: null,
    fullDescriptionUk: '',
    fullDescriptionRu: '',
    fullDescriptionEn: '',
    galleryUrls: [],
    photoUrl: '',
    priceCents: 1000,
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
    ...overrides,
  };
}

function sampleCategory(overrides: Partial<ChurchProductCategoryDto> = {}): ChurchProductCategoryDto {
  return {
    id: 'category-1',
    siteId: 'site-1',
    slug: 'ikony',
    nameUk: 'Ікони',
    nameRu: '',
    nameEn: '',
    descriptionUk: '',
    descriptionRu: '',
    descriptionEn: '',
    imageUrl: '',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveProductImages / resolveCategoryImage (Stage 2J)', () => {
  it('resolves a bare R2 key photoUrl/galleryUrls to an absolute URL, same as calendarDayFromChurchPage does for imageUrl', () => {
    const product = resolveProductImages(sampleProduct({
      photoUrl: 'media/products/1/gallery/uuid.png',
      galleryUrls: ['media/products/1/gallery/uuid.png', 'media/products/1/gallery/uuid2.png'],
    }));
    expect(product.photoUrl).toContain('/media/products/1/gallery/uuid.png');
    expect(product.photoUrl.startsWith('media/')).toBe(false);
    expect(product.galleryUrls).toHaveLength(2);
    expect(product.galleryUrls[0]).toContain('/media/products/1/gallery/uuid.png');
  });

  it('leaves an empty photoUrl as an empty string rather than a broken URL', () => {
    const product = resolveProductImages(sampleProduct({ photoUrl: '' }));
    expect(product.photoUrl).toBe('');
  });

  it('resolves a bare R2 key imageUrl for categories the same way', () => {
    const category = resolveCategoryImage(sampleCategory({ imageUrl: 'media/categories/1/main/uuid.png' }));
    expect(category.imageUrl).toContain('/media/categories/1/main/uuid.png');
    expect(category.imageUrl.startsWith('media/')).toBe(false);
  });

  it('leaves an empty category imageUrl as an empty string', () => {
    const category = resolveCategoryImage(sampleCategory({ imageUrl: '' }));
    expect(category.imageUrl).toBe('');
  });
});
