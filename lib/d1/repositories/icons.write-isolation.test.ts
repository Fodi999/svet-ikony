import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DIAGNOSIS-ONLY test (not part of the app's own test suite / not committed
 * by that suite's author) proving language write-isolation for church_icons
 * -- the "row-per-language" localization pattern (see 0001_svetikony_schema.sql:
 * church_icons has `language` + `translation_group_id`, UNIQUE(slug, language),
 * one full row per language, not one row with uk/ru/en columns).
 *
 * Purpose-built local fake D1, same house style as
 * lib/d1/repositories/orders.test.ts / lib/d1/test-support/mock-d1-database.ts
 * (a small hand-rolled fake matching icons.ts's exact statement shapes, not a
 * general SQL engine). Runs entirely in-memory via `vitest run` -- no network,
 * no real D1, no production data touched.
 */
type Row = Record<string, unknown>;

class FakeIconsDb {
  tables: { church_icons: Row[] } = { church_icons: [] };

  reset() {
    this.tables.church_icons = [];
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeIconsDb,
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

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const rows = this.execute();
    return { success: true, meta: { changes: rows.length, last_row_id: 0 } };
  }

  private execute(): Row[] {
    const sql = this.sql.replace(/\s+/g, ' ').trim();

    // getIcon(id)
    if (/^SELECT .* FROM church_icons WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.church_icons.filter((r) => r.id === id);
    }

    // updateIcon(id, payload) -- mirrors icons.ts's exact UPDATE, param order:
    // calendar_day_id, title, slug, image_url, gallery_urls, saint_name, feast_name,
    // description, language, status, order_enabled, order_block_text, production_time,
    // price_cents, currency, consecration_available, [slug subquery], [id != subquery],
    // [id fallback subquery], [id WHERE clause]
    if (/^UPDATE church_icons SET/i.test(sql)) {
      const [
        calendar_day_id, title, slug, image_url, gallery_urls, saint_name, feast_name,
        description, language, status, order_enabled, order_block_text, production_time,
        price_cents, currency, consecration_available,
        , // slug (subquery, unused by this fake)
        , // id != (subquery, unused by this fake)
        , // id (translation_group_id fallback subquery, unused -- fake keeps it unchanged)
        whereId,
      ] = this.params;

      const row = this.db.tables.church_icons.find((r) => r.id === whereId);
      if (!row) return [];
      Object.assign(row, {
        calendar_day_id, title, slug, image_url, gallery_urls, saint_name, feast_name,
        description, language, status, order_enabled, order_block_text, production_time,
        price_cents, currency, consecration_available,
        // translation_group_id deliberately left untouched by this fake -- the real
        // COALESCE subquery resolves to the same value for an already-linked triplet,
        // which is exactly the steady-state scenario this test exercises.
      });
      return [row];
    }

    throw new Error(`FakeIconsDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeIconsDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { updateIcon } = await import('./icons');

function seedIconRow(overrides: Row): Row {
  const row: Row = {
    id: 'icon-uk',
    calendar_day_id: null,
    title: 'Ікона Св. Миколая',
    slug: 'svt-mykolai',
    image_url: '',
    gallery_urls: '[]',
    saint_name: '',
    feast_name: '',
    description: 'Опис українською',
    language: 'uk',
    translation_group_id: 'group-nikolai',
    status: 'published',
    order_enabled: 0,
    order_block_text: '',
    production_time: '',
    price_cents: null,
    currency: 'UAH',
    consecration_available: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  fakeDb.tables.church_icons.push(row);
  return row;
}

describe('updateIcon -- write isolation across church_icons language rows', () => {
  beforeEach(() => fakeDb.reset());

  it('editing the UK row leaves the RU and EN sibling rows completely untouched', async () => {
    seedIconRow({ id: 'icon-uk', language: 'uk', title: 'Ікона Св. Миколая', description: 'Опис УК', status: 'published' });
    seedIconRow({ id: 'icon-ru', language: 'ru', title: 'Икона Св. Николая', description: 'Описание РУ', status: 'published' });
    seedIconRow({ id: 'icon-en', language: 'en', title: 'Icon of St. Nicholas', description: 'EN description', status: 'published' });

    await updateIcon('icon-uk', { title: 'Ікона Св. Миколая (ОНОВЛЕНО)', description: 'Новий опис УК', status: 'draft' });

    const uk = fakeDb.tables.church_icons.find((r) => r.id === 'icon-uk')!;
    const ru = fakeDb.tables.church_icons.find((r) => r.id === 'icon-ru')!;
    const en = fakeDb.tables.church_icons.find((r) => r.id === 'icon-en')!;

    expect(uk.title).toBe('Ікона Св. Миколая (ОНОВЛЕНО)');
    expect(uk.description).toBe('Новий опис УК');
    expect(uk.status).toBe('draft');

    // The claim under test: RU/EN rows are separate D1 rows (`WHERE id = ?`
    // scopes the UPDATE to exactly one row), so a UK-only edit cannot leak.
    expect(ru.title).toBe('Икона Св. Николая');
    expect(ru.description).toBe('Описание РУ');
    expect(ru.status).toBe('published');
    expect(en.title).toBe('Icon of St. Nicholas');
    expect(en.description).toBe('EN description');
    expect(en.status).toBe('published');
  });

  it('editing the RU row leaves UK and EN untouched (symmetry check)', async () => {
    seedIconRow({ id: 'icon-uk', language: 'uk', title: 'UK title', description: 'UK desc' });
    seedIconRow({ id: 'icon-ru', language: 'ru', title: 'RU title', description: 'RU desc' });
    seedIconRow({ id: 'icon-en', language: 'en', title: 'EN title', description: 'EN desc' });

    await updateIcon('icon-ru', { title: 'RU title CHANGED' });

    expect(fakeDb.tables.church_icons.find((r) => r.id === 'icon-uk')!.title).toBe('UK title');
    expect(fakeDb.tables.church_icons.find((r) => r.id === 'icon-en')!.title).toBe('EN title');
    expect(fakeDb.tables.church_icons.find((r) => r.id === 'icon-ru')!.title).toBe('RU title CHANGED');
  });

  it('editing EN leaves UK and RU untouched (symmetry check)', async () => {
    seedIconRow({ id: 'icon-uk', language: 'uk', title: 'UK title' });
    seedIconRow({ id: 'icon-ru', language: 'ru', title: 'RU title' });
    seedIconRow({ id: 'icon-en', language: 'en', title: 'EN title' });

    await updateIcon('icon-en', { title: 'EN title CHANGED' });

    expect(fakeDb.tables.church_icons.find((r) => r.id === 'icon-uk')!.title).toBe('UK title');
    expect(fakeDb.tables.church_icons.find((r) => r.id === 'icon-ru')!.title).toBe('RU title');
    expect(fakeDb.tables.church_icons.find((r) => r.id === 'icon-en')!.title).toBe('EN title CHANGED');
  });
});
