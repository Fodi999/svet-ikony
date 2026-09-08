import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseImageMetadata } from './calendarDays';

/**
 * Provenance JSON must never crash a read just because an old row predates
 * a field, or because the column somehow holds something unexpected (task:
 * "malformed/null старый image_metadata -- parsing должен быть fail-safe").
 */
describe('parseImageMetadata', () => {
  it('returns null for a null column', () => {
    expect(parseImageMetadata(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseImageMetadata('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseImageMetadata('{not valid json')).toBeNull();
  });

  it('returns null for valid JSON that is not an object (string, number, array)', () => {
    expect(parseImageMetadata('"just a string"')).toBeNull();
    expect(parseImageMetadata('42')).toBeNull();
    expect(parseImageMetadata('[1,2,3]')).toBeNull();
  });

  it('returns null for an object missing the required origin/identityVerified fields', () => {
    expect(parseImageMetadata(JSON.stringify({ referenceTitle: 'Some Saint' }))).toBeNull();
    expect(parseImageMetadata(JSON.stringify({ origin: 'manual' }))).toBeNull();
    expect(parseImageMetadata(JSON.stringify({ origin: 'not-a-real-origin', identityVerified: true }))).toBeNull();
  });

  it('parses a minimal pre-Wikidata-rewrite record (only the original field set) unchanged', () => {
    const legacy = { origin: 'ai_generated', identityVerified: false };
    expect(parseImageMetadata(JSON.stringify(legacy))).toEqual(legacy);
  });

  it('parses a full record with every new provenance field populated', () => {
    const full = {
      origin: 'ai_generated',
      referenceProvider: 'commons',
      referenceLanguage: 'en',
      referencePageUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      referenceImageUrl: 'https://upload.wikimedia.org/x.jpg',
      referenceTitle: 'Agathonicus',
      referenceAuthor: 'Unknown',
      referenceLicense: 'Public domain',
      referenceAttribution: 'Wikimedia Commons',
      wikidataId: 'Q3564977',
      commonsFileTitle: 'File:Saint Agathonikos of Nikomedeia Mosaic Medallion, Chora.jpg',
      commonsCategory: 'Agathonikos of Nikomedeia',
      identityVerified: true,
    };
    expect(parseImageMetadata(JSON.stringify(full))).toEqual(full);
  });

  it('parses a manual-origin record with no reference fields at all', () => {
    const manual = { origin: 'manual', identityVerified: false };
    expect(parseImageMetadata(JSON.stringify(manual))).toEqual(manual);
  });
});

/**
 * PHASE MULTILINGUAL-3 / Part 1a regression proof: createCalendarDay /
 * updateCalendarDay previously never referenced `translation_group_id` in
 * their SQL at all, so every insert silently fell back to the column's own
 * DB-level random-UUID DEFAULT -- meaning two calendar days with the exact
 * same slug in different languages never actually linked as siblings (the
 * admin's TranslationSwitcher relies entirely on this auto-join, same as
 * icons/prayers/saints/alphabet already do). This proves the fix: a
 * COALESCE-by-slug on both insert and update, matching icons.ts's own
 * pattern exactly, plus the NULL-for-blank-slug guard (church_calendar_days
 * is the one entity that allows an empty slug -- two blank-slug days must
 * never be silently grouped together just because they share '').
 *
 * Purpose-built local fake D1, same house style as
 * icons.write-isolation.test.ts -- interprets the exact statement shapes
 * calendarDays.ts issues, not a general SQL engine.
 */
type Row = Record<string, unknown>;

class FakeCalendarDb {
  tables: { church_calendar_days: Row[] } = { church_calendar_days: [] };
  nextId = 1;

  reset() {
    this.tables.church_calendar_days = [];
    this.nextId = 1;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeCalendarDb,
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

    // getCalendarDay(id)
    if (/^SELECT .* FROM church_calendar_days WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.church_calendar_days.filter((r) => r.id === id);
    }

    // createCalendarDay -- param order mirrors calendarDays.ts's INSERT
    // exactly: 15 column values, then [slugForMatch, fallbackGroupId] for
    // the COALESCE subquery.
    if (/^INSERT INTO church_calendar_days/i.test(sql)) {
      const [
        date_old_style, date_new_style, calendar_type, title, slug, language, day_type,
        description, history, image_url, rank, status, seo_title, seo_description, image_metadata,
        slugForMatch, fallbackGroupId,
      ] = this.params;

      const sibling = slugForMatch != null ? this.db.tables.church_calendar_days.find((r) => r.slug === slugForMatch) : undefined;
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackGroupId;

      const row: Row = {
        id: `day-${this.db.nextId++}`,
        date_old_style, date_new_style, calendar_type, title, slug, language, day_type,
        description, history, image_url, rank, status, seo_title, seo_description, image_metadata,
        translation_group_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.church_calendar_days.push(row);
      return [row];
    }

    // updateCalendarDay -- 15 SET values, then [slugForMatch, excludeId,
    // fallbackId, whereId] for the COALESCE subquery + final WHERE.
    if (/^UPDATE church_calendar_days SET/i.test(sql)) {
      const [
        date_old_style, date_new_style, calendar_type, title, slug, language, day_type,
        description, history, image_url, rank, status, seo_title, seo_description, image_metadata,
        slugForMatch, excludeId, fallbackId, whereId,
      ] = this.params;

      const row = this.db.tables.church_calendar_days.find((r) => r.id === whereId);
      if (!row) return [];

      const sibling =
        slugForMatch != null
          ? this.db.tables.church_calendar_days.find((r) => r.slug === slugForMatch && r.id !== excludeId)
          : undefined;
      const fallbackRow = this.db.tables.church_calendar_days.find((r) => r.id === fallbackId);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackRow!.translation_group_id;

      Object.assign(row, {
        date_old_style, date_new_style, calendar_type, title, slug, language, day_type,
        description, history, image_url, rank, status, seo_title, seo_description, image_metadata,
        translation_group_id,
      });
      return [row];
    }

    throw new Error(`FakeCalendarDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeCalendarDb = new FakeCalendarDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeCalendarDb } }),
}));

const { createCalendarDay, updateCalendarDay } = await import('./calendarDays');

describe('createCalendarDay / updateCalendarDay -- translation_group_id auto-join by slug', () => {
  beforeEach(() => fakeCalendarDb.reset());

  it('a second day created with the same slug as an existing one joins its translation group', async () => {
    const uk = await createCalendarDay({ title: 'Різдво', slug: 'nativity', dateNewStyle: '2026-01-07', language: 'uk' });
    const ru = await createCalendarDay({ title: 'Рождество', slug: 'nativity', dateNewStyle: '2026-01-07', language: 'ru' });

    expect(ru.translationGroupId).toBe(uk.translationGroupId);
  });

  it('a day created with a genuinely new slug gets its own independent group', async () => {
    const first = await createCalendarDay({ title: 'Різдво', slug: 'nativity', dateNewStyle: '2026-01-07', language: 'uk' });
    const second = await createCalendarDay({ title: 'Стрітення', slug: 'candlemas', dateNewStyle: '2026-02-15', language: 'uk' });

    expect(second.translationGroupId).not.toBe(first.translationGroupId);
  });

  it('two days created with NO slug at all (blank) are never silently grouped together just because they share the empty string', async () => {
    const first = await createCalendarDay({ title: 'Day A', dateNewStyle: '2026-03-01', language: 'uk' });
    const second = await createCalendarDay({ title: 'Day B', dateNewStyle: '2026-03-02', language: 'uk' });

    expect(second.translationGroupId).not.toBe(first.translationGroupId);
  });

  it('updating a day to a slug that matches an existing sibling joins that group', async () => {
    const uk = await createCalendarDay({ title: 'Різдво', slug: 'nativity', dateNewStyle: '2026-01-07', language: 'uk' });
    const ru = await createCalendarDay({ title: 'Untranslated draft', slug: 'temp-ru-slug', dateNewStyle: '2026-01-07', language: 'ru' });
    expect(ru.translationGroupId).not.toBe(uk.translationGroupId);

    const updated = await updateCalendarDay(ru.id, { slug: 'nativity' });

    expect(updated.translationGroupId).toBe(uk.translationGroupId);
  });

  it('updating a day\'s unrelated fields (not slug) keeps its existing group, never regenerating a random one', async () => {
    const uk = await createCalendarDay({ title: 'Різдво', slug: 'nativity', dateNewStyle: '2026-01-07', language: 'uk' });
    const ru = await createCalendarDay({ title: 'Рождество', slug: 'nativity', dateNewStyle: '2026-01-07', language: 'ru' });

    const updated = await updateCalendarDay(ru.id, { title: 'Рождество Христово' });

    expect(updated.translationGroupId).toBe(uk.translationGroupId);
  });
});
