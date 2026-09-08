import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Proves language write-isolation for church_info -- the "single-row
 * JSON-blob" localization pattern (see 0001_svetikony_schema.sql:
 * church_info has exactly one row and a single `translations` TEXT column
 * holding `{ uk: {...}, ru: {...}, en: {...} }` as one JSON string; there is
 * no `language` column and no per-language row).
 *
 * putChurchInfo() reads the current row first and merges:
 *  - `translations`: shallow-merged per top-level language key
 *    (`{ ...current.translations, ...payload.translations }`). A language
 *    key entirely absent from payload.translations is preserved unchanged.
 *    A language key explicitly present in payload.translations replaces
 *    that language's whole entry -- intentional, not a bug.
 *  - every other scalar column: `payload.X ?? current.X`, the same
 *    fallback-to-current convention used by icons.ts/productCategories.ts.
 *
 * Purpose-built local fake D1, same house style as
 * lib/d1/repositories/orders.test.ts / lib/d1/test-support/mock-d1-database.ts.
 * Runs entirely in-memory via `vitest run` -- no network, no real D1, no
 * production data touched.
 */
type Row = Record<string, unknown>;

class FakeChurchInfoDb {
  tables: { church_info: Row[] } = { church_info: [] };

  reset() {
    this.tables.church_info = [];
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeChurchInfoDb,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async first<T = Row>(): Promise<T | null> {
    return (this.execute()[0] as T) ?? null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.execute() as T[] };
  }

  private execute(): Row[] {
    const sql = this.sql.replace(/\s+/g, ' ').trim();

    // putChurchInfo()'s existence probe -- MUST be checked before the
    // full-column SELECT below (both start with "SELECT ... FROM
    // church_info LIMIT 1"; this one selects only `id`).
    if (/^SELECT id FROM church_info LIMIT 1$/i.test(sql)) {
      const row = this.db.tables.church_info[0];
      return row ? [{ id: row.id }] : [];
    }

    // getChurchInfo()'s full-row SELECT (COLUMNS starts with "id, address, maps_url, ...").
    if (/^SELECT id, address, maps_url/i.test(sql)) {
      return [...this.db.tables.church_info];
    }

    // putChurchInfo()'s UPDATE branch (existing row) -- param order:
    // address, maps_url, phone_or_site, priest_phone, image_url,
    // gallery_images, translations, status, id
    if (/^UPDATE church_info SET/i.test(sql)) {
      const [address, maps_url, phone_or_site, priest_phone, image_url, gallery_images, translations, status, id] = this.params;
      const row = this.db.tables.church_info.find((r) => r.id === id);
      if (!row) return [];
      Object.assign(row, { address, maps_url, phone_or_site, priest_phone, image_url, gallery_images, translations, status });
      return [row];
    }

    // putChurchInfo()'s INSERT branch (first-ever save, zero rows).
    if (/^INSERT INTO church_info/i.test(sql)) {
      const [address, maps_url, phone_or_site, priest_phone, image_url, gallery_images, translations, status] = this.params;
      const row: Row = {
        id: 'generated-id',
        address, maps_url, phone_or_site, priest_phone, image_url, gallery_images, translations, status,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.church_info.push(row);
      return [row];
    }

    throw new Error(`FakeChurchInfoDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeChurchInfoDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { putChurchInfo } = await import('./churchInfo');

function seedChurchInfoRow() {
  fakeDb.tables.church_info.push({
    id: 'church-1',
    address: 'вул. Хрещатик, 1',
    maps_url: '',
    phone_or_site: '',
    priest_phone: '',
    image_url: '',
    gallery_images: '[]',
    translations: JSON.stringify({
      uk: { title: 'Храм', description: 'Опис УК' },
      ru: { title: 'Церковь', description: 'Описание РУ' },
      en: { title: 'Church', description: 'EN description' },
    }),
    status: 'published',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

describe('putChurchInfo -- write isolation across the translations JSON blob', () => {
  beforeEach(() => fakeDb.reset());

  it('the real admin flow (full tri-lingual snapshot round-tripped every save) preserves RU/EN when only UK is edited', async () => {
    // Mirrors what ChurchInfoForm actually sends: react-hook-form loads the
    // WHOLE `translations` object (all 3 langs) via `values: query.data` at
    // mount, the tab switcher only changes which nested fields are visibly
    // rendered, and handleSave() submits `form.getValues()` -- the complete
    // object, every language included -- regardless of which tab was open.
    seedChurchInfoRow();

    await putChurchInfo({
      address: 'вул. Хрещатик, 1',
      status: 'published',
      translations: {
        uk: { title: 'Храм (ОНОВЛЕНО)', description: 'Опис УК новий' },
        ru: { title: 'Церковь', description: 'Описание РУ' }, // unchanged, but still explicitly present
        en: { title: 'Church', description: 'EN description' }, // unchanged, but still explicitly present
      },
    });

    const row = fakeDb.tables.church_info[0]!;
    const saved = JSON.parse(row.translations as string);
    expect(saved.uk.title).toBe('Храм (ОНОВЛЕНО)');
    expect(saved.ru.title).toBe('Церковь');
    expect(saved.en.title).toBe('Church');
  });

  it('a payload with only translations.uk preserves the existing ru/en entries untouched', async () => {
    // church_info's `translations` column holds all 3 languages in one JSON
    // blob (unlike church_icons/church_prayers/church_saints, which are
    // `UPDATE ... SET col = ? WHERE id = ?` scoped to one language's own
    // row). putChurchInfo() must read-modify-merge per language key instead
    // of writing payload.translations verbatim, so a partial payload (a
    // future per-tab PATCH endpoint, a client only editing one tab) does not
    // destroy the other languages.
    seedChurchInfoRow();

    await putChurchInfo({
      translations: { uk: { title: 'Тільки UK' } }, // ru/en keys entirely absent from the payload
    });

    const row = fakeDb.tables.church_info[0]!;
    const saved = JSON.parse(row.translations as string);
    expect(saved.uk.title).toBe('Тільки UK');
    expect(saved.ru).toEqual({ title: 'Церковь', description: 'Описание РУ' }); // preserved, not wiped
    expect(saved.en).toEqual({ title: 'Church', description: 'EN description' }); // preserved, not wiped
  });

  it('a payload that explicitly includes translations.ru replaces that language entry wholesale (intentional, not a bug)', async () => {
    // Explicit inclusion of a language key means the caller intends to
    // replace that language's entire translation object -- this is a
    // shallow per-language merge, not a deep per-sub-field merge, and even
    // an empty-looking object for an explicitly-included language is
    // respected as the new value rather than merged with the old one.
    seedChurchInfoRow();

    await putChurchInfo({
      translations: { ru: { title: 'Новый заголовок' } }, // explicitly present -> full replace of `ru`
    });

    const row = fakeDb.tables.church_info[0]!;
    const saved = JSON.parse(row.translations as string);
    expect(saved.ru).toEqual({ title: 'Новый заголовок' }); // replaced wholesale, old `description` not merged back in
    expect(saved.uk).toEqual({ title: 'Храм', description: 'Опис УК' }); // untouched, key omitted from payload
    expect(saved.en).toEqual({ title: 'Church', description: 'EN description' }); // untouched, key omitted from payload
  });

  it('omitting a scalar field (e.g. address) preserves the current row value instead of blanking it', async () => {
    // Same fix applied to every other column: payload.X ?? current.X, the
    // same convention icons.ts/productCategories.ts already use, instead of
    // payload.X ?? '' / [] / 'draft'.
    seedChurchInfoRow();

    await putChurchInfo({ translations: { uk: { title: 'x' } } }); // address, mapsUrl, status, etc. all omitted

    const row = fakeDb.tables.church_info[0]!;
    expect(row.address).toBe('вул. Хрещатик, 1'); // preserved, not blanked to ''
    expect(row.status).toBe('published'); // preserved, not reset to 'draft'
  });

  it('a genuinely new row (no existing row yet) still inserts correctly with sensible defaults', async () => {
    // fakeDb starts empty (no seedChurchInfoRow()) -- current is the
    // emptyChurchInfo() sentinel, so payload.X ?? current.X still yields
    // sane defaults ('' / [] / {} / 'draft') on first-ever save, and the
    // INSERT branch (not UPDATE) is taken.
    await putChurchInfo({
      address: 'вул. Нова, 5',
      translations: { uk: { title: 'Перший запис' } },
    });

    expect(fakeDb.tables.church_info).toHaveLength(1);
    const row = fakeDb.tables.church_info[0]!;
    expect(row.id).toBe('generated-id'); // INSERT branch, not UPDATE
    expect(row.address).toBe('вул. Нова, 5');
    expect(row.status).toBe('draft'); // default, no current row to fall back to
    const saved = JSON.parse(row.translations as string);
    expect(saved.uk.title).toBe('Перший запис');
    expect(saved.ru).toBeUndefined();
    expect(saved.en).toBeUndefined();
  });
});
