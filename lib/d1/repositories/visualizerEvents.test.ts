import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * visualizer_events is a brand-new table (migrations/0019_visualizer.sql),
 * row-per-language like church_saints/church_alphabet_letters -- this
 * proves the same COALESCE-by-slug translation_group_id auto-join those
 * repositories use, plus the sort_year fallback computation and
 * published_at first-publish stamping that are unique to this table.
 *
 * Purpose-built local fake D1, same house style as
 * gospel.test.ts / alphabet.test.ts / calendarDays.test.ts.
 */
type Row = Record<string, unknown>;

class FakeVisualizerEventsDb {
  tables: { visualizer_events: Row[] } = { visualizer_events: [] };
  nextId = 1;

  reset() {
    this.tables.visualizer_events = [];
    this.nextId = 1;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeVisualizerEventsDb,
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

    if (/^SELECT .* FROM visualizer_events WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.visualizer_events.filter((r) => r.id === id);
    }

    // createVisualizerEvent -- 20 column values, then [status (CASE),
    // slugForMatch, fallbackGroupId].
    if (/^INSERT INTO visualizer_events/i.test(sql)) {
      const [
        slug, language, title, summary, description, event_type, chronology_type, era, calendar_era,
        year_start, year_end, century, display_date, sort_year, location_name, latitude, longitude,
        calendar_day_id, status, is_featured, statusForCase, slugForMatch, fallbackGroupId,
      ] = this.params;

      const sibling = this.db.tables.visualizer_events.find((r) => r.slug === slugForMatch);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackGroupId;
      const published_at = statusForCase === 'published' ? '2026-01-01T00:00:00.000Z' : null;

      const row: Row = {
        id: `event-${this.db.nextId++}`,
        slug, language, title, summary, description, event_type, chronology_type, era, calendar_era,
        year_start, year_end, century, display_date, sort_year, location_name, latitude, longitude,
        calendar_day_id, status, is_featured, published_at,
        translation_group_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.visualizer_events.push(row);
      return [row];
    }

    // updateVisualizerEvent -- 20 SET values, then [statusForCase,
    // slugForMatch, excludeId, fallbackId, whereId].
    if (/^UPDATE visualizer_events SET/i.test(sql)) {
      const [
        slug, language, title, summary, description, event_type, chronology_type, era, calendar_era,
        year_start, year_end, century, display_date, sort_year, location_name, latitude, longitude,
        calendar_day_id, status, is_featured, statusForCase, slugForMatch, excludeId, fallbackId, whereId,
      ] = this.params;

      const row = this.db.tables.visualizer_events.find((r) => r.id === whereId);
      if (!row) return [];

      const sibling = this.db.tables.visualizer_events.find((r) => r.slug === slugForMatch && r.id !== excludeId);
      const fallbackRow = this.db.tables.visualizer_events.find((r) => r.id === fallbackId);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackRow!.translation_group_id;
      const published_at = statusForCase === 'published' && row.published_at == null ? '2026-01-02T00:00:00.000Z' : row.published_at;

      Object.assign(row, {
        slug, language, title, summary, description, event_type, chronology_type, era, calendar_era,
        year_start, year_end, century, display_date, sort_year, location_name, latitude, longitude,
        calendar_day_id, status, is_featured, published_at, translation_group_id,
      });
      return [row];
    }

    throw new Error(`FakeVisualizerEventsDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeVisualizerEventsDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { createVisualizerEvent, updateVisualizerEvent } = await import('./visualizerEvents');

describe('createVisualizerEvent / updateVisualizerEvent', () => {
  beforeEach(() => fakeDb.reset());

  describe('translation_group_id auto-join by slug', () => {
    it('a second event created with the same slug as an existing one joins its translation group', async () => {
      const uk = await createVisualizerEvent({ title: 'Хрещення Русі', slug: 'khreshchennya-rusi', language: 'uk' });
      const en = await createVisualizerEvent({ title: 'Baptism of Rus', slug: 'khreshchennya-rusi', language: 'en' });
      expect(en.translationGroupId).toBe(uk.translationGroupId);
    });

    it('an event created with a genuinely new slug gets its own independent group', async () => {
      const first = await createVisualizerEvent({ title: 'A', slug: 'event-a' });
      const second = await createVisualizerEvent({ title: 'B', slug: 'event-b' });
      expect(second.translationGroupId).not.toBe(first.translationGroupId);
    });

    it('updating an event to a slug that matches an existing sibling joins that group', async () => {
      const uk = await createVisualizerEvent({ title: 'Хрещення Русі', slug: 'khreshchennya-rusi', language: 'uk' });
      const en = await createVisualizerEvent({ title: 'Untranslated draft', slug: 'temp-en-slug', language: 'en' });
      const updated = await updateVisualizerEvent(en.id, { slug: 'khreshchennya-rusi' });
      expect(updated.translationGroupId).toBe(uk.translationGroupId);
    });
  });

  describe('sort_year computation', () => {
    it('uses yearStart directly for an AD event', async () => {
      const event = await createVisualizerEvent({ title: 'X', yearStart: 988, calendarEra: 'AD' });
      expect(event.sortYear).toBe(988);
    });

    it('negates yearStart for a BC event, so BC sorts before AD', async () => {
      const event = await createVisualizerEvent({ title: 'Exodus', yearStart: 1446, calendarEra: 'BC' });
      expect(event.sortYear).toBe(-1446);
    });

    it('falls back to century * 100 when no exact year is known', async () => {
      const event = await createVisualizerEvent({ title: 'Medieval thing', century: 10, calendarEra: 'AD' });
      expect(event.sortYear).toBe(1000);
    });

    it('falls back to 0 when neither yearStart nor century is known (traditional/period dating)', async () => {
      const event = await createVisualizerEvent({ title: 'Traditional event', chronologyType: 'traditional' });
      expect(event.sortYear).toBe(0);
    });

    it('respects an explicit sortYear override even when yearStart is also present', async () => {
      const event = await createVisualizerEvent({ title: 'X', yearStart: 988, sortYear: 500 });
      expect(event.sortYear).toBe(500);
    });

    it('recomputes sort_year on update when yearStart changes, without an explicit override', async () => {
      const created = await createVisualizerEvent({ title: 'X', yearStart: 988, calendarEra: 'AD' });
      const updated = await updateVisualizerEvent(created.id, { yearStart: 1000 });
      expect(updated.sortYear).toBe(1000);
    });
  });

  describe('published_at', () => {
    it('is stamped on create when status is published', async () => {
      const event = await createVisualizerEvent({ title: 'X', status: 'published' });
      expect(event.publishedAt).not.toBeNull();
    });

    it('stays null on create when status is draft', async () => {
      const event = await createVisualizerEvent({ title: 'X', status: 'draft' });
      expect(event.publishedAt).toBeNull();
    });

    it('is stamped the first time an update transitions status to published', async () => {
      const created = await createVisualizerEvent({ title: 'X', status: 'draft' });
      expect(created.publishedAt).toBeNull();
      const updated = await updateVisualizerEvent(created.id, { status: 'published' });
      expect(updated.publishedAt).not.toBeNull();
    });

    it('does not overwrite the original published_at on a later edit', async () => {
      const created = await createVisualizerEvent({ title: 'X', status: 'published' });
      const firstPublishedAt = created.publishedAt;
      const updated = await updateVisualizerEvent(created.id, { title: 'X (edited)' });
      expect(updated.publishedAt).toBe(firstPublishedAt);
    });
  });
});
