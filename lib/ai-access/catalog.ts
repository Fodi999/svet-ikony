export const CATALOG = {
  calendar: {
    path: "calendar-days",
    required: ["title", "slug", "dateNewStyle", "language"],
    text: ["description", "history"],
    image: "imageUrl",
    strings: [
      "dateOldStyle",
      "dateNewStyle",
      "calendarType",
      "title",
      "slug",
      "language",
      "dayType",
      "description",
      "history",
      "imageUrl",
      "seoTitle",
      "seoDescription",
    ],
    numbers: ["rank"],
    refs: {},
  },
  saints: {
    path: "saints",
    required: ["name", "slug", "language"],
    text: ["shortDescription", "biography"],
    image: "imageUrl",
    strings: [
      "slug",
      "name",
      "shortDescription",
      "biography",
      "feastDayOldStyle",
      "feastDayNewStyle",
      "imageUrl",
      "language",
    ],
    refs: {
      iconId: "icons",
      calendarDayId: "calendar",
    },
  },
  icons: {
    path: "icons",
    required: ["title", "slug", "language"],
    text: ["description"],
    image: "imageUrl",
    strings: [
      "title",
      "slug",
      "imageUrl",
      "saintName",
      "feastName",
      "description",
      "history",
      "saintImageDescription",
      "language",
    ],
    arrays: ["galleryUrls"],
    refs: {
      calendarDayId: "calendar",
    },
  },
  prayers: {
    path: "prayers",
    required: ["title", "slug", "language", "text"],
    text: ["text"],
    image: "imageUrl",
    strings: [
      "slug",
      "title",
      "text",
      "audioUrl",
      "imageUrl",
      "source",
      "sourceUrl",
      "note",
      "language",
      "prayerType",
    ],
    refs: {
      iconId: "icons",
      calendarDayId: "calendar",
    },
  },
  articles: {
    path: "articles",
    required: ["title", "slug", "language", "content"],
    text: ["content"],
    strings: [
      "title",
      "slug",
      "content",
      "language",
      "seoTitle",
      "seoDescription",
    ],
    refs: {
      iconId: "icons",
      calendarDayId: "calendar",
    },
  },
  gospel: {
    path: "gospel",
    required: ["title", "slug", "language", "reference", "text"],
    text: ["text", "explanation"],
    strings: ["slug", "title", "reference", "text", "explanation", "language"],
    refs: {
      iconId: "icons",
      calendarDayId: "calendar",
    },
  },
  alphabet: {
    path: "alphabet",
    required: ["letter", "name", "slug", "language"],
    text: ["shortDescription", "fullText"],
    image: "mainImageUrl",
    strings: [
      "slug",
      "letter",
      "name",
      "shortDescription",
      "fullText",
      "modernEquivalent",
      "cardImageUrl",
      "mainImageUrl",
      "seoTitle",
      "seoDescription",
      "audioUrl",
      "language",
    ],
    numbers: ["sortOrder", "numericValue"],
    refs: {},
  },
  /**
   * Phase D: AI shop-copy on Product listings. Deliberately excludes
   * EVERY commercial/operational field (nameUk/Ru/En, slug, description,
   * categoryId, photoUrl, galleryUrls, priceCents, currency,
   * productionTime, consecrationAvailable, stockStatus, featured,
   * isActive, sortOrder) from `strings`/`numbers`/`arrays`/`booleans` --
   * NOT an oversight, the enforcement mechanism itself: patchFor() rejects
   * any patch key that isn't in this allow-list with "Unsupported proposal
   * field", so no code path (current or future) can ever propose a change
   * to price/stock/production time/consecration/name/slug/category/photos
   * through this entity's AI-proposal system, matching the explicit "never
   * modify" requirement at the schema level, not just in
   * product-ai-actions.ts's own code. Only the 9 marketing/SEO text
   * columns are ever proposable. `required` is empty because none of
   * those 9 are DB-required (nameUk/slug ARE required, but neither is
   * proposable here at all, so listing them would be misleading).
   */
  products: {
    path: "products",
    required: [],
    text: ["fullDescriptionUk"],
    image: "photoUrl",
    strings: [
      "fullDescriptionUk",
      "fullDescriptionRu",
      "fullDescriptionEn",
      "seoTitleUk",
      "seoTitleRu",
      "seoTitleEn",
      "seoDescriptionUk",
      "seoDescriptionRu",
      "seoDescriptionEn",
    ],
    refs: {},
  },
} as const;
