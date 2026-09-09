import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression proof for migration 0018_alphabet_audio.sql's new audio_url
 * column: createAlphabetLetter/updateAlphabetLetter must actually persist
 * and round-trip it (default '' on create when omitted, preserved on
 * update when omitted, overwritten when supplied) -- same as every other
 * plain string column already covered implicitly by the repository's own
 * types, but this is the first explicit test for this repository at all.
 *
 * Purpose-built local fake D1, same house style as
 * gospel.test.ts / articles.test.ts / calendarDays.test.ts.
 */
type Row = Record<string, unknown>;

class FakeAlphabetDb {
  tables: { church_alphabet_letters: Row[] } = { church_alphabet_letters: [] };
  nextId = 1;

  reset() {
    this.tables.church_alphabet_letters = [];
    this.nextId = 1;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeAlphabetDb,
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

    if (/^SELECT .* FROM church_alphabet_letters WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.church_alphabet_letters.filter((r) => r.id === id);
    }

    // createAlphabetLetter -- 16 column values, then [slugForMatch, fallbackGroupId].
    if (/^INSERT INTO church_alphabet_letters/i.test(sql)) {
      const [
        slug, letter, sort_order, name, short_description, full_text, numeric_value, modern_equivalent, color,
        card_image_url, main_image_url, seo_title, seo_description, audio_url, language, status,
        slugForMatch, fallbackGroupId,
      ] = this.params;

      const sibling = this.db.tables.church_alphabet_letters.find((r) => r.slug === slugForMatch);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackGroupId;

      const row: Row = {
        id: `letter-${this.db.nextId++}`,
        slug, letter, sort_order, name, short_description, full_text, numeric_value, modern_equivalent, color,
        card_image_url, main_image_url, seo_title, seo_description, audio_url, language, status,
        translation_group_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.church_alphabet_letters.push(row);
      return [row];
    }

    // updateAlphabetLetter -- 16 SET values, then [slugForMatch, excludeId, fallbackId, whereId].
    if (/^UPDATE church_alphabet_letters SET/i.test(sql)) {
      const [
        slug, letter, sort_order, name, short_description, full_text, numeric_value, modern_equivalent, color,
        card_image_url, main_image_url, seo_title, seo_description, audio_url, language, status,
        slugForMatch, excludeId, fallbackId, whereId,
      ] = this.params;

      const row = this.db.tables.church_alphabet_letters.find((r) => r.id === whereId);
      if (!row) return [];

      const sibling = this.db.tables.church_alphabet_letters.find((r) => r.slug === slugForMatch && r.id !== excludeId);
      const fallbackRow = this.db.tables.church_alphabet_letters.find((r) => r.id === fallbackId);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackRow!.translation_group_id;

      Object.assign(row, {
        slug, letter, sort_order, name, short_description, full_text, numeric_value, modern_equivalent, color,
        card_image_url, main_image_url, seo_title, seo_description, audio_url, language, status,
        translation_group_id,
      });
      return [row];
    }

    throw new Error(`FakeAlphabetDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeAlphabetDb = new FakeAlphabetDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeAlphabetDb } }),
}));

const { createAlphabetLetter, updateAlphabetLetter } = await import('./alphabet');

describe('createAlphabetLetter / updateAlphabetLetter -- audio_url', () => {
  beforeEach(() => fakeAlphabetDb.reset());

  it('defaults audioUrl to an empty string when not supplied on create', async () => {
    const letter = await createAlphabetLetter({ name: 'Буки', letter: 'Б', slug: 'buky' });
    expect(letter.audioUrl).toBe('');
  });

  it('persists a supplied audioUrl on create', async () => {
    const letter = await createAlphabetLetter({
      name: 'Буки', letter: 'Б', slug: 'buky', audioUrl: 'https://media.example.com/buky-uk.mp3',
    });
    expect(letter.audioUrl).toBe('https://media.example.com/buky-uk.mp3');
  });

  it('overwrites audioUrl when update supplies a new value', async () => {
    const created = await createAlphabetLetter({
      name: 'Буки', letter: 'Б', slug: 'buky', audioUrl: 'https://media.example.com/old.mp3',
    });
    const updated = await updateAlphabetLetter(created.id, { audioUrl: 'https://media.example.com/new.mp3' });
    expect(updated.audioUrl).toBe('https://media.example.com/new.mp3');
  });

  it('preserves the existing audioUrl when update omits it', async () => {
    const created = await createAlphabetLetter({
      name: 'Буки', letter: 'Б', slug: 'buky', audioUrl: 'https://media.example.com/keep-me.mp3',
    });
    const updated = await updateAlphabetLetter(created.id, { shortDescription: 'Оновлений опис' });
    expect(updated.audioUrl).toBe('https://media.example.com/keep-me.mp3');
  });
});
