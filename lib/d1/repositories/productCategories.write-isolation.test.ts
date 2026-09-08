import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DIAGNOSIS-ONLY test proving language write-isolation for
 * icon_product_categories -- the "column-per-language" localization pattern
 * (see 0001_svetikony_schema.sql: one row per category, with name_uk/
 * name_ru/name_en and description_uk/description_ru/description_en as
 * separate columns on that single row -- no `language` column, no
 * translation_group_id, no per-language row).
 *
 * Note (see svetikony-admin's app/api/bff/product-categories/_contract.ts):
 * as of Phase MULTILINGUAL-1 (P1.2), the admin's CategoryForm has UK/RU/EN
 * tabs and sends nameRu/nameEn/descriptionRu/descriptionEn on every save.
 * Before that phase it never sent them at all -- the first test below still
 * covers that narrower legacy shape (a caller that genuinely omits
 * nameRu/nameEn), and the third test covers the current real shape (all
 * three languages sent every time). Both are *safe* only because of a
 * specific code pattern (`payload.nameRu ?? current.nameRu`) in
 * updateProductCategory() below, not because of anything the BFF or D1
 * schema enforces -- the second test shows exactly where that guarantee
 * stops holding.
 *
 * Purpose-built local fake D1, same house style as
 * lib/d1/repositories/orders.test.ts / lib/d1/test-support/mock-d1-database.ts.
 * Runs entirely in-memory via `vitest run` -- no network, no real D1, no
 * production data touched.
 */
type Row = Record<string, unknown>;

class FakeCategoriesDb {
  tables: { icon_product_categories: Row[] } = { icon_product_categories: [] };

  reset() {
    this.tables.icon_product_categories = [];
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeCategoriesDb,
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

    // getProductCategory(id)
    if (/^SELECT .* FROM icon_product_categories WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.icon_product_categories.filter((r) => r.id === id);
    }

    // updateProductCategory(id, payload) -- param order:
    // slug, name_uk, name_ru, name_en, description_uk, description_ru,
    // description_en, image_url, is_active, sort_order, id
    if (/^UPDATE icon_product_categories SET/i.test(sql)) {
      const [slug, name_uk, name_ru, name_en, description_uk, description_ru, description_en, image_url, is_active, sort_order, id] =
        this.params;
      const row = this.db.tables.icon_product_categories.find((r) => r.id === id);
      if (!row) return [];
      Object.assign(row, { slug, name_uk, name_ru, name_en, description_uk, description_ru, description_en, image_url, is_active, sort_order });
      return [row];
    }

    throw new Error(`FakeCategoriesDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeCategoriesDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { updateProductCategory } = await import('./productCategories');

function seedCategoryRow() {
  fakeDb.tables.icon_product_categories.push({
    id: 'cat-1',
    slug: 'ikony',
    name_uk: 'Ікони',
    name_ru: 'Иконы',
    name_en: 'Icons',
    description_uk: 'Опис УК',
    description_ru: 'Описание РУ',
    description_en: 'EN description',
    image_url: '',
    is_active: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

describe('updateProductCategory -- write isolation across name_uk/name_ru/name_en columns', () => {
  beforeEach(() => fakeDb.reset());

  it('the real admin payload shape (nameUk only -- nameRu/nameEn genuinely absent) preserves RU/EN columns', async () => {
    // Mirrors the actual BFF payload: WorkerProductCategoryWritePayload
    // (app/api/bff/product-categories/_contract.ts in svetikony-admin) has
    // no nameRu/nameEn/descriptionRu/descriptionEn fields at all -- the
    // admin form never collects them, so the key is truly absent
    // (`undefined`), not sent as `""`.
    seedCategoryRow();

    await updateProductCategory('cat-1', { nameUk: 'Ікони (нове)', descriptionUk: 'Новий опис УК' });

    const row = fakeDb.tables.icon_product_categories.find((r) => r.id === 'cat-1')!;
    expect(row.name_uk).toBe('Ікони (нове)');
    expect(row.description_uk).toBe('Новий опис УК');

    // The claim under test: `payload.nameRu ?? current.nameRu` (and the RU/EN
    // description equivalents) fall back to the row's own current value
    // whenever the key is omitted -- so a UK-only admin save cannot clobber
    // the RU/EN columns on the same row.
    expect(row.name_ru).toBe('Иконы');
    expect(row.name_en).toBe('Icons');
    expect(row.description_ru).toBe('Описание РУ');
    expect(row.description_en).toBe('EN description');
  });

  it('BOUNDARY -- the safety guard is nullish-only: an explicit empty string DOES overwrite (unlike omission)', async () => {
    // `payload.nameRu ?? current.nameRu` only falls back on null/undefined.
    // The current admin UI never sends `nameRu: ""` (the field doesn't
    // exist in its form), but nothing in productCategories.ts itself
    // prevents a caller from doing so -- this documents exactly where the
    // "by construction" safety claim stops applying, per the task's
    // instruction to check this on the actual code, not assume it.
    seedCategoryRow();

    await updateProductCategory('cat-1', { nameRu: '' });

    const row = fakeDb.tables.icon_product_categories.find((r) => r.id === 'cat-1')!;
    expect(row.name_ru).toBe(''); // overwritten, NOT preserved
    expect(row.name_en).toBe('Icons'); // still untouched (key genuinely absent)
    expect(row.name_uk).toBe('Ікони'); // still untouched
  });

  it('the new widened admin payload (all 3 languages sent every save) writes each language to its own columns without cross-contamination', async () => {
    // Mirrors the real payload svetikony-admin's category-form.tsx now
    // sends on every save (Phase MULTILINGUAL-1, P1.2): the full current
    // form state for all three language tabs, every time -- never a
    // partial diff. Editing only the UK tab in the UI still means the
    // RU/EN sub-values are sent unchanged from what was loaded, so this
    // proves that shape is *also* safe.
    seedCategoryRow();

    await updateProductCategory('cat-1', {
      nameUk: 'Ікони (оновлено)',
      nameRu: 'Иконы',
      nameEn: 'Icons',
      descriptionUk: 'Новий опис УК',
      descriptionRu: 'Описание РУ',
      descriptionEn: 'EN description',
    });

    const row = fakeDb.tables.icon_product_categories.find((r) => r.id === 'cat-1')!;
    expect(row.name_uk).toBe('Ікони (оновлено)');
    expect(row.description_uk).toBe('Новий опис УК');

    // RU/EN values, sent unchanged (not omitted), land back in exactly
    // their own columns -- not swapped, not merged, not dropped.
    expect(row.name_ru).toBe('Иконы');
    expect(row.name_en).toBe('Icons');
    expect(row.description_ru).toBe('Описание РУ');
    expect(row.description_en).toBe('EN description');
  });
});
