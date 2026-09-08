import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PHASE MULTILINGUAL-3 / Part 1b-c regression proof: church_articles had NO
 * `translation_group_id` column at all before migration
 * 0017_articles_gospel_translation_group.sql -- this proves the new
 * COALESCE-by-slug auto-join on createArticle/updateArticle, matching
 * icons.ts's own pattern exactly (articles always require a real,
 * non-empty slug -- see `required(payload.slug, 'slug')` in articles.ts --
 * so unlike calendarDays there's no blank-slug edge case to guard here).
 *
 * Purpose-built local fake D1, same house style as
 * icons.write-isolation.test.ts / calendarDays.test.ts -- interprets the
 * exact statement shapes articles.ts issues, not a general SQL engine.
 */
type Row = Record<string, unknown>;

class FakeArticlesDb {
  tables: { church_articles: Row[] } = { church_articles: [] };
  nextId = 1;

  reset() {
    this.tables.church_articles = [];
    this.nextId = 1;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeArticlesDb,
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

    if (/^SELECT .* FROM church_articles WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.church_articles.filter((r) => r.id === id);
    }

    // createArticle -- 9 column values, then [slugForMatch, fallbackGroupId].
    if (/^INSERT INTO church_articles/i.test(sql)) {
      const [icon_id, calendar_day_id, title, slug, content, language, seo_title, seo_description, status, slugForMatch, fallbackGroupId] =
        this.params;

      const sibling = this.db.tables.church_articles.find((r) => r.slug === slugForMatch);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackGroupId;

      const row: Row = {
        id: `article-${this.db.nextId++}`,
        icon_id, calendar_day_id, title, slug, content, language, seo_title, seo_description, status,
        translation_group_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.church_articles.push(row);
      return [row];
    }

    // updateArticle -- 9 SET values, then [slugForMatch, excludeId, fallbackId, whereId].
    if (/^UPDATE church_articles SET/i.test(sql)) {
      const [icon_id, calendar_day_id, title, slug, content, language, seo_title, seo_description, status, slugForMatch, excludeId, fallbackId, whereId] =
        this.params;

      const row = this.db.tables.church_articles.find((r) => r.id === whereId);
      if (!row) return [];

      const sibling = this.db.tables.church_articles.find((r) => r.slug === slugForMatch && r.id !== excludeId);
      const fallbackRow = this.db.tables.church_articles.find((r) => r.id === fallbackId);
      const translation_group_id = sibling ? sibling.translation_group_id : fallbackRow!.translation_group_id;

      Object.assign(row, { icon_id, calendar_day_id, title, slug, content, language, seo_title, seo_description, status, translation_group_id });
      return [row];
    }

    throw new Error(`FakeArticlesDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeArticlesDb = new FakeArticlesDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeArticlesDb } }),
}));

const { createArticle, updateArticle } = await import('./articles');

describe('createArticle / updateArticle -- translation_group_id auto-join by slug', () => {
  beforeEach(() => fakeArticlesDb.reset());

  it('a second article created with the same slug as an existing one joins its translation group', async () => {
    const uk = await createArticle({ title: 'Стаття', slug: 'article-one', language: 'uk' });
    const ru = await createArticle({ title: 'Статья', slug: 'article-one', language: 'ru' });

    expect(ru.translationGroupId).toBe(uk.translationGroupId);
  });

  it('an article created with a genuinely new slug gets its own independent group', async () => {
    const first = await createArticle({ title: 'Стаття A', slug: 'article-a', language: 'uk' });
    const second = await createArticle({ title: 'Стаття B', slug: 'article-b', language: 'uk' });

    expect(second.translationGroupId).not.toBe(first.translationGroupId);
  });

  it('updating an article to a slug that matches an existing sibling joins that group', async () => {
    const uk = await createArticle({ title: 'Стаття', slug: 'article-one', language: 'uk' });
    const ru = await createArticle({ title: 'Untranslated draft', slug: 'temp-ru-slug', language: 'ru' });
    expect(ru.translationGroupId).not.toBe(uk.translationGroupId);

    const updated = await updateArticle(ru.id, { slug: 'article-one' });

    expect(updated.translationGroupId).toBe(uk.translationGroupId);
  });

  it('updating an article\'s unrelated fields (not slug) keeps its existing group', async () => {
    const uk = await createArticle({ title: 'Стаття', slug: 'article-one', language: 'uk' });
    const ru = await createArticle({ title: 'Статья', slug: 'article-one', language: 'ru' });

    const updated = await updateArticle(ru.id, { content: 'Оновлений текст' });

    expect(updated.translationGroupId).toBe(uk.translationGroupId);
  });
});
