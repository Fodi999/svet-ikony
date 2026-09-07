import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 2B-6: a purpose-built fake, local to this file (not an extension
 * of lib/d1/test-support/mock-d1-database.ts, which is deliberately
 * scoped to the admin-auth tables only — see its own doc comment).
 * getDashboardStats() issues exactly 2 statement shapes: one large
 * aggregate SELECT (many correlated scalar subqueries) and one upcoming-
 * calendar-days SELECT. This fake reimplements both in plain JS over
 * seeded in-memory rows.
 *
 * The aggregate SQL itself (in dashboard.ts) was verified against real
 * SQLite (node:sqlite) during design, with seeded rows and hand-computed
 * expected values, before being written here — this fake mirrors that
 * same, already-proven logic (same GROUP BY/HAVING semantics for
 * "missing translations", same WHERE conditions) rather than inventing
 * new logic to independently get right twice. Real node:sqlite was not
 * used directly in this test suite, matching this repo's established
 * decision (see mock-d1-database.ts's own doc comment: no CI safety net
 * here for an experimental Node API) — this is a deliberate, documented
 * choice, not an oversight.
 */

type Row = Record<string, unknown>;

class FakeDashboardDb {
  tables: Record<string, Row[]> = {
    icon_orders: [],
    church_icons: [],
    church_prayers: [],
    church_saints: [],
    church_gospel_readings: [],
    church_articles: [],
    church_calendar_days: [],
  };

  reset(): void {
    for (const key of Object.keys(this.tables)) this.tables[key] = [];
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }
}

function countMissingTranslationGroups(rows: Row[]): number {
  const byGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    const groupId = row.translation_group_id as string;
    const set = byGroup.get(groupId) ?? new Set<string>();
    set.add(row.language as string);
    byGroup.set(groupId, set);
  }
  let missing = 0;
  for (const languages of byGroup.values()) {
    if (languages.size < 3) missing += 1;
  }
  return missing;
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeDashboardDb,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = this.execute();
    return (rows[0] as T) ?? null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.execute() as T[] };
  }

  private execute(): Row[] {
    const normalized = this.sql.replace(/\s+/g, ' ').trim();
    const t = this.db.tables;

    if (normalized.startsWith('SELECT (SELECT COUNT(*) FROM icon_orders WHERE status')) {
      const countBy = (rows: Row[], field: string, value: unknown) => rows.filter((r) => r[field] === value).length;
      const statusRows = (table: Row[]) => table;
      const draftsAndPublished = (status: string) =>
        countBy(t.church_icons, 'status', status) +
        countBy(t.church_prayers, 'status', status) +
        countBy(t.church_saints, 'status', status) +
        countBy(t.church_gospel_readings, 'status', status) +
        countBy(t.church_articles, 'status', status) +
        countBy(t.church_calendar_days, 'status', status);

      return [
        {
          new_orders: countBy(t.icon_orders, 'status', 'new'),
          unread_orders: t.icon_orders.filter((o) => o.is_read === 0 || o.is_read === false).length,
          drafts: draftsAndPublished('draft'),
          published: draftsAndPublished('published'),
          missing_translations:
            countMissingTranslationGroups(statusRows(t.church_icons)) +
            countMissingTranslationGroups(statusRows(t.church_saints)) +
            countMissingTranslationGroups(statusRows(t.church_calendar_days)),
          missing_images: countBy(t.church_icons, 'image_url', '') + countBy(t.church_saints, 'image_url', ''),
          prayers_without_audio: countBy(t.church_prayers, 'audio_url', ''),
        },
      ];
    }

    if (normalized.startsWith('SELECT id, title, date_new_style AS date, status FROM church_calendar_days')) {
      const [today] = this.params as [string];
      return t.church_calendar_days
        .filter((d) => d.language === 'uk' && (d.date_new_style as string) >= today)
        .sort((a, b) => (a.date_new_style as string).localeCompare(b.date_new_style as string))
        .slice(0, 5)
        .map((d) => ({ id: d.id, title: d.title, date: d.date_new_style, status: d.status }));
    }

    throw new Error(`FakeDashboardDb: unrecognized statement shape: ${normalized.slice(0, 80)}`);
  }
}

const fakeDb = new FakeDashboardDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { getDashboardStats } = await import('./dashboard');

describe('getDashboardStats — seeded aggregation', () => {
  beforeEach(() => fakeDb.reset());

  it('computes exact aggregate numbers from real seeded rows, not hardcoded expectations', async () => {
    // Orders: 2 new, 3 unread (of 5 total) -- same seed as the design-time
    // node:sqlite validation.
    fakeDb.tables.icon_orders = [
      { id: 'o1', status: 'new', is_read: 0 },
      { id: 'o2', status: 'new', is_read: 0 },
      { id: 'o3', status: 'contacted', is_read: 0 },
      { id: 'o4', status: 'completed', is_read: 1 },
      { id: 'o5', status: 'cancelled', is_read: 1 },
    ];
    // Icons: 2 draft (1 missing image), 1 published; group g1 has uk+ru
    // (missing en), group g2 has only uk (missing ru+en).
    fakeDb.tables.church_icons = [
      { id: 'i1', status: 'draft', translation_group_id: 'g1', language: 'uk', image_url: '' },
      { id: 'i2', status: 'draft', translation_group_id: 'g1', language: 'ru', image_url: 'https://x/img.jpg' },
      { id: 'i3', status: 'published', translation_group_id: 'g2', language: 'uk', image_url: 'https://x/img2.jpg' },
    ];
    // Prayers: 1 draft, 1 published, 1 without audio.
    fakeDb.tables.church_prayers = [
      { id: 'p1', status: 'draft', audio_url: '' },
      { id: 'p2', status: 'published', audio_url: 'https://x/a.mp3' },
    ];
    // Saints: all 3 published, full translation group (uk/ru/en) -- not
    // missing; 1 missing image.
    fakeDb.tables.church_saints = [
      { id: 's1', status: 'published', translation_group_id: 'g3', language: 'uk', image_url: '' },
      { id: 's2', status: 'published', translation_group_id: 'g3', language: 'ru', image_url: 'https://x/s.jpg' },
      { id: 's3', status: 'published', translation_group_id: 'g3', language: 'en', image_url: 'https://x/s2.jpg' },
    ];
    // Gospel: 1 draft.
    fakeDb.tables.church_gospel_readings = [{ id: 'gr1', status: 'draft' }];
    // Articles: 1 published.
    fakeDb.tables.church_articles = [{ id: 'a1', status: 'published' }];
    // Calendar days: 2 published, both single-language groups (missing 2
    // languages each); both upcoming relative to '2026-01-01'.
    fakeDb.tables.church_calendar_days = [
      { id: 'c1', status: 'published', translation_group_id: 'g4', language: 'uk', date_new_style: '2026-12-25', title: 'Christmas' },
      { id: 'c2', status: 'published', translation_group_id: 'g5', language: 'uk', date_new_style: '2026-06-01', title: 'Other Day' },
    ];

    const stats = await getDashboardStats('2026-01-01T00:00:00.000Z');

    // Every expected value here is hand-derived from the seed above, not
    // copied from the implementation -- same numbers independently
    // verified against real SQLite during design (see dashboard.ts's doc
    // comment).
    expect(stats.newOrders).toBe(2);
    expect(stats.unreadOrders).toBe(3);
    expect(stats.drafts).toBe(4); // 2 icons + 1 prayer + 1 gospel
    expect(stats.published).toBe(8); // 1 icon + 1 prayer + 3 saints + 1 article + 2 calendar
    expect(stats.missingTranslations).toBe(4); // icons: g1(2 langs)+g2(1 lang)=2; saints: 0; calendar: g4+g5=2
    expect(stats.missingImages).toBe(2); // icon i1 + saint s1
    expect(stats.prayersWithoutAudio).toBe(1);
    expect(stats.upcomingCalendarDays).toHaveLength(2);
    expect(stats.upcomingCalendarDays[0]).toEqual({ id: 'c2', title: 'Other Day', date: '2026-06-01', status: 'published' });
    expect(stats.upcomingCalendarDays[1]).toEqual({ id: 'c1', title: 'Christmas', date: '2026-12-25', status: 'published' });
  });

  it('returns all zeros and an empty upcoming list against a genuinely empty database — never throws, never fabricates a nonzero number', async () => {
    const stats = await getDashboardStats('2026-01-01T00:00:00.000Z');
    expect(stats).toEqual({
      newOrders: 0,
      unreadOrders: 0,
      drafts: 0,
      published: 0,
      missingTranslations: 0,
      missingImages: 0,
      prayersWithoutAudio: 0,
      upcomingCalendarDays: [],
    });
  });

  it('excludes a past calendar day from upcomingCalendarDays', async () => {
    fakeDb.tables.church_calendar_days = [
      { id: 'past', status: 'published', translation_group_id: 'gp', language: 'uk', date_new_style: '2025-01-01', title: 'Past' },
      { id: 'future', status: 'published', translation_group_id: 'gf', language: 'uk', date_new_style: '2026-06-01', title: 'Future' },
    ];
    const stats = await getDashboardStats('2026-01-01T00:00:00.000Z');
    expect(stats.upcomingCalendarDays.map((d) => d.id)).toEqual(['future']);
  });

  it('does not expose a mediaUploadErrors field at all -- no tracking table exists, so it is omitted rather than faked as 0', async () => {
    const stats = await getDashboardStats('2026-01-01T00:00:00.000Z');
    expect(stats).not.toHaveProperty('mediaUploadErrors');
  });

  it('the DTO carries only aggregates and a bounded content list -- no order rows, no customer PII of any kind', async () => {
    fakeDb.tables.icon_orders = [{ id: 'o1', status: 'new', is_read: 0 }];
    const stats = await getDashboardStats('2026-01-01T00:00:00.000Z');
    const serialized = JSON.stringify(stats);
    expect(serialized).not.toContain('customerName');
    expect(serialized).not.toContain('contactValue');
    expect(serialized).not.toContain('adminNote');
  });
});
