import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DIAGNOSIS-ONLY test proving language write-isolation for
 * icon_order_options (DTO name ChurchProductDto, admin-facing name
 * "Product") -- the same "column-per-language" localization pattern as
 * icon_product_categories (see productCategories.write-isolation.test.ts):
 * one row per product, with name_uk/name_ru/name_en, full_description_uk/
 * full_description_ru/full_description_en, and seo_title_uk/seo_title_ru/
 * seo_title_en + seo_description_uk/seo_description_ru/seo_description_en
 * all as separate columns on that single row -- no `language` column, no
 * translation_group_id, no per-language row (unlike church_icons).
 *
 * Phase MULTILINGUAL-1 (P1.1) widened svetikony-admin's BFF contract/HTTP
 * layer/product-form.tsx to actually collect and send nameRu/nameEn/
 * fullDescriptionRu/fullDescriptionEn/seoTitleRu/seoTitleEn/
 * seoDescriptionRu/seoDescriptionEn -- this test proves updateProduct()'s
 * `payload.nameRu ?? current.nameRu` (and siblings) merge-on-omit pattern
 * safely isolates each language's columns regardless of which fields a
 * given caller happens to send, both for the narrow legacy shape (nameUk
 * only) and the new full 3-language shape the admin now sends on every
 * save.
 *
 * Purpose-built local fake D1, same house style as
 * lib/d1/repositories/icons.write-isolation.test.ts /
 * productCategories.write-isolation.test.ts / orders.test.ts /
 * lib/d1/test-support/mock-d1-database.ts. Runs entirely in-memory via
 * `vitest run` -- no network, no real D1, no production data touched.
 */
type Row = Record<string, unknown>;

class FakeProductsDb {
  tables: { icon_order_options: Row[] } = { icon_order_options: [] };

  reset() {
    this.tables.icon_order_options = [];
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeProductsDb,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async first<T = Row>(): Promise<T | null> {
    return (this.execute()[0] as T) ?? null;
  }

  private execute(): Row[] {
    const sql = this.sql.replace(/\s+/g, ' ').trim();

    // getProduct(id) -- also used internally by updateProduct() to load
    // `current` before merging.
    if (/^SELECT .* FROM icon_order_options WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.icon_order_options.filter((r) => r.id === id);
    }

    // updateProduct(id, payload) -- mirrors products.ts's exact UPDATE,
    // param order: slug, name_uk, name_ru, name_en, description,
    // category_id, linked_icon_translation_group_id, full_description_uk,
    // full_description_ru, full_description_en, gallery_urls, photo_url,
    // price_cents, currency, production_time, consecration_available,
    // stock_status, featured, seo_title_uk, seo_title_ru, seo_title_en,
    // seo_description_uk, seo_description_ru, seo_description_en,
    // is_active, sort_order, id
    if (/^UPDATE icon_order_options SET/i.test(sql)) {
      const [
        slug, name_uk, name_ru, name_en, description, category_id, linked_icon_translation_group_id,
        full_description_uk, full_description_ru, full_description_en, gallery_urls, photo_url, price_cents,
        currency, production_time, consecration_available, stock_status, featured, seo_title_uk, seo_title_ru,
        seo_title_en, seo_description_uk, seo_description_ru, seo_description_en, is_active, sort_order,
        id,
      ] = this.params;

      const row = this.db.tables.icon_order_options.find((r) => r.id === id);
      if (!row) return [];
      Object.assign(row, {
        slug, name_uk, name_ru, name_en, description, category_id, linked_icon_translation_group_id,
        full_description_uk, full_description_ru, full_description_en, gallery_urls, photo_url, price_cents,
        currency, production_time, consecration_available, stock_status, featured, seo_title_uk, seo_title_ru,
        seo_title_en, seo_description_uk, seo_description_ru, seo_description_en, is_active, sort_order,
      });
      return [row];
    }

    throw new Error(`FakeProductsDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeProductsDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { updateProduct } = await import('./products');

function seedProductRow() {
  fakeDb.tables.icon_order_options.push({
    id: 'product-1',
    slug: 'ikona-mykolaya',
    name_uk: 'Ікона Миколая',
    name_ru: 'Икона Николая',
    name_en: 'Icon of Nicholas',
    description: 'Плоский опис (без мовних варіантів)',
    category_id: null,
    linked_icon_translation_group_id: null,
    full_description_uk: 'Повний опис УК',
    full_description_ru: 'Полное описание РУ',
    full_description_en: 'EN full description',
    gallery_urls: '[]',
    photo_url: '',
    price_cents: 100000,
    currency: 'UAH',
    production_time: '',
    consecration_available: 0,
    stock_status: 'available',
    featured: 0,
    seo_title_uk: 'SEO заголовок УК',
    seo_title_ru: 'SEO заголовок РУ',
    seo_title_en: 'EN SEO title',
    seo_description_uk: 'SEO опис УК',
    seo_description_ru: 'SEO описание РУ',
    seo_description_en: 'EN SEO description',
    is_active: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

describe('updateProduct -- write isolation across name/fullDescription/seoTitle/seoDescription *_uk/*_ru/*_en columns', () => {
  beforeEach(() => fakeDb.reset());

  it('the legacy admin payload shape (nameUk only -- nameRu/nameEn genuinely absent) preserves every RU/EN column', async () => {
    // Mirrors the pre-Phase-MULTILINGUAL-1 BFF payload shape: nameRu/nameEn/
    // fullDescriptionRu/fullDescriptionEn/seoTitleRu/seoTitleEn/
    // seoDescriptionRu/seoDescriptionEn genuinely never sent (key absent,
    // not empty string).
    seedProductRow();

    await updateProduct('product-1', { nameUk: 'Ікона Миколая (нове)', priceCents: 120000 });

    const row = fakeDb.tables.icon_order_options.find((r) => r.id === 'product-1')!;
    expect(row.name_uk).toBe('Ікона Миколая (нове)');
    expect(row.price_cents).toBe(120000);

    // The claim under test: every *_ru/*_en column falls back to the row's
    // own current value whenever the key is omitted -- a UK-only save
    // cannot clobber RU/EN columns on the same row.
    expect(row.name_ru).toBe('Икона Николая');
    expect(row.name_en).toBe('Icon of Nicholas');
    expect(row.full_description_ru).toBe('Полное описание РУ');
    expect(row.full_description_en).toBe('EN full description');
    expect(row.seo_title_ru).toBe('SEO заголовок РУ');
    expect(row.seo_title_en).toBe('EN SEO title');
    expect(row.seo_description_ru).toBe('SEO описание РУ');
    expect(row.seo_description_en).toBe('EN SEO description');
  });

  it('the new widened admin payload (all 3 languages sent every save) writes each language to its own columns without cross-contamination', async () => {
    // Mirrors the real payload svetikony-admin's product-form.tsx now sends
    // on every save (Phase MULTILINGUAL-1, P1.1): the full current form
    // state for all three language tabs, every time -- never a partial
    // diff. Editing only the UK tab in the UI still means the RU/EN
    // sub-objects are sent unchanged from what was loaded, so this proves
    // that shape is *also* safe (each language's payload value lands in
    // exactly that language's own column, not some other one).
    seedProductRow();

    await updateProduct('product-1', {
      nameUk: 'Ікона Миколая (оновлено)',
      nameRu: 'Икона Николая',
      nameEn: 'Icon of Nicholas',
      fullDescriptionUk: 'Повний опис УК (оновлено)',
      fullDescriptionRu: 'Полное описание РУ',
      fullDescriptionEn: 'EN full description',
      seoTitleUk: 'SEO заголовок УК (оновлено)',
      seoTitleRu: 'SEO заголовок РУ',
      seoTitleEn: 'EN SEO title',
      seoDescriptionUk: 'SEO опис УК (оновлено)',
      seoDescriptionRu: 'SEO описание РУ',
      seoDescriptionEn: 'EN SEO description',
    });

    const row = fakeDb.tables.icon_order_options.find((r) => r.id === 'product-1')!;
    expect(row.name_uk).toBe('Ікона Миколая (оновлено)');
    expect(row.full_description_uk).toBe('Повний опис УК (оновлено)');
    expect(row.seo_title_uk).toBe('SEO заголовок УК (оновлено)');
    expect(row.seo_description_uk).toBe('SEO опис УК (оновлено)');

    // RU/EN values, sent unchanged (not omitted), land back in exactly
    // their own columns -- not swapped, not merged, not dropped.
    expect(row.name_ru).toBe('Икона Николая');
    expect(row.name_en).toBe('Icon of Nicholas');
    expect(row.full_description_ru).toBe('Полное описание РУ');
    expect(row.full_description_en).toBe('EN full description');
    expect(row.seo_title_ru).toBe('SEO заголовок РУ');
    expect(row.seo_title_en).toBe('EN SEO title');
    expect(row.seo_description_ru).toBe('SEO описание РУ');
    expect(row.seo_description_en).toBe('EN SEO description');
  });

  it('editing only the RU tab (nameRu/fullDescriptionRu/seoTitleRu/seoDescriptionRu sent, UK/EN omitted) leaves UK and EN columns untouched (symmetry check)', async () => {
    seedProductRow();

    await updateProduct('product-1', {
      nameRu: 'Икона Николая (изменено)',
      fullDescriptionRu: 'Полное описание РУ (изменено)',
      seoTitleRu: 'SEO заголовок РУ (изменено)',
      seoDescriptionRu: 'SEO описание РУ (изменено)',
    });

    const row = fakeDb.tables.icon_order_options.find((r) => r.id === 'product-1')!;
    expect(row.name_ru).toBe('Икона Николая (изменено)');
    expect(row.full_description_ru).toBe('Полное описание РУ (изменено)');
    expect(row.seo_title_ru).toBe('SEO заголовок РУ (изменено)');
    expect(row.seo_description_ru).toBe('SEO описание РУ (изменено)');

    expect(row.name_uk).toBe('Ікона Миколая');
    expect(row.name_en).toBe('Icon of Nicholas');
    expect(row.full_description_uk).toBe('Повний опис УК');
    expect(row.full_description_en).toBe('EN full description');
    expect(row.seo_title_uk).toBe('SEO заголовок УК');
    expect(row.seo_title_en).toBe('EN SEO title');
    expect(row.seo_description_uk).toBe('SEO опис УК');
    expect(row.seo_description_en).toBe('EN SEO description');
  });

  it('BOUNDARY -- the safety guard is nullish-only: an explicit empty string DOES overwrite (unlike omission)', async () => {
    // `payload.nameRu ?? current.nameRu` only falls back on null/undefined.
    // svetikony-admin's widened product-form.tsx always sends the form's
    // full current state (never an explicit "" for a language the admin
    // didn't intend to clear), so this doesn't happen in practice from the
    // real UI -- but nothing in products.ts itself prevents a caller from
    // doing so. Documents exactly where the "by construction" safety claim
    // stops applying, same as productCategories.write-isolation.test.ts's
    // equivalent boundary case.
    seedProductRow();

    await updateProduct('product-1', { nameRu: '' });

    const row = fakeDb.tables.icon_order_options.find((r) => r.id === 'product-1')!;
    expect(row.name_ru).toBe(''); // overwritten, NOT preserved
    expect(row.name_en).toBe('Icon of Nicholas'); // still untouched (key genuinely absent)
    expect(row.name_uk).toBe('Ікона Миколая'); // still untouched
  });
});
