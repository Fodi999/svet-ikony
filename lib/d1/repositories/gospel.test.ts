import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PHASE MULTILINGUAL-3 / Part 1b-c regression proof: church_gospel_readings
 * had NO `translation_group_id` column at all before migration
 * 0017_articles_gospel_translation_group.sql -- this proves the new
 * COALESCE-by-slug auto-join on createGospel/updateGospel, matching
 * icons.ts's own pattern exactly.
 *
 * Purpose-built local fake D1, same house style as
 * icons.write-isolation.test.ts / calendarDays.test.ts / articles.test.ts.
 */
type Row = Record<string, unknown>;

class FakeGospelDb {
  tables: { church_gospel_readings: Row[] } = { church_gospel_readings: [] };
  nextId = 1;

  reset() {
    this.tables.church_gospel_readings = [];
    this.nextId = 1;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeGospelDb,
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

    if (/^SELECT .* FROM church_gospel_readings WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.church_gospel_readings.filter((r) => r.id === id);
    }

    // createGospel -- 9 column values, then [slugForMatch, fallbackGroupId].
    if (/^INSERT INTO church_gospel_readings/i.test(sql)) {
      const [icon_id, calendar_day_id, slug, title, reference, text, explanation, language, status, slugForMatch, fallbackGroupId] =
        this.params;

      const sibling = this.db.tables.church_gospel_readings.find((r) => r.slug === slugForMatch);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackGroupId;

      const row: Row = {
        id: `gospel-${this.db.nextId++}`,
        icon_id, calendar_day_id, slug, title, reference, text, explanation, language, status,
        translation_group_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.church_gospel_readings.push(row);
      return [row];
    }

    // updateGospel -- 9 SET values, then [slugForMatch, excludeId, fallbackId, whereId].
    if (/^UPDATE church_gospel_readings SET/i.test(sql)) {
      const [icon_id, calendar_day_id, slug, title, reference, text, explanation, language, status, slugForMatch, excludeId, fallbackId, whereId] =
        this.params;

      const row = this.db.tables.church_gospel_readings.find((r) => r.id === whereId);
      if (!row) return [];

      const sibling = this.db.tables.church_gospel_readings.find((r) => r.slug === slugForMatch && r.id !== excludeId);
      const fallbackRow = this.db.tables.church_gospel_readings.find((r) => r.id === fallbackId);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackRow!.translation_group_id;

      Object.assign(row, { icon_id, calendar_day_id, slug, title, reference, text, explanation, language, status, translation_group_id });
      return [row];
    }

    throw new Error(`FakeGospelDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeGospelDb = new FakeGospelDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeGospelDb } }),
}));

const { createGospel, updateGospel } = await import('./gospel');

describe('createGospel / updateGospel -- translation_group_id auto-join by slug', () => {
  beforeEach(() => fakeGospelDb.reset());

  it('a second reading created with the same slug as an existing one joins its translation group', async () => {
    const uk = await createGospel({ title: 'Читання', slug: 'reading-one', language: 'uk' });
    const ru = await createGospel({ title: 'Чтение', slug: 'reading-one', language: 'ru' });

    expect(ru.translationGroupId).toBe(uk.translationGroupId);
  });

  it('a reading created with a genuinely new slug gets its own independent group', async () => {
    const first = await createGospel({ title: 'Читання A', slug: 'reading-a', language: 'uk' });
    const second = await createGospel({ title: 'Читання B', slug: 'reading-b', language: 'uk' });

    expect(second.translationGroupId).not.toBe(first.translationGroupId);
  });

  it('updating a reading to a slug that matches an existing sibling joins that group', async () => {
    const uk = await createGospel({ title: 'Читання', slug: 'reading-one', language: 'uk' });
    const ru = await createGospel({ title: 'Untranslated draft', slug: 'temp-ru-slug', language: 'ru' });
    expect(ru.translationGroupId).not.toBe(uk.translationGroupId);

    const updated = await updateGospel(ru.id, { slug: 'reading-one' });

    expect(updated.translationGroupId).toBe(uk.translationGroupId);
  });

  it('updating a reading\'s unrelated fields (not slug) keeps its existing group', async () => {
    const uk = await createGospel({ title: 'Читання', slug: 'reading-one', language: 'uk' });
    const ru = await createGospel({ title: 'Чтение', slug: 'reading-one', language: 'ru' });

    const updated = await updateGospel(ru.id, { text: 'Оновлений текст' });

    expect(updated.translationGroupId).toBe(uk.translationGroupId);
  });
});
