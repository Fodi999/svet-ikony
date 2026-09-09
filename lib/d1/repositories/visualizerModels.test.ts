import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * visualizer_models is a brand-new table (migrations/0019_visualizer.sql).
 * This proves: eventGroupId existence validation (event_group_id has no
 * SQL FOREIGN KEY -- see the migration's own header comment for why --
 * so the repository must enforce it in application code instead), and
 * setBaseEarthModel's atomic unset-then-set behavior (the partial unique
 * index only allows one is_base_earth = 1 row at a time).
 *
 * Purpose-built local fake D1, same house style as the other repository
 * tests in this directory.
 */
type Row = Record<string, unknown>;

class FakeVisualizerModelsDb {
  tables: { visualizer_events: Row[]; visualizer_models: Row[] } = { visualizer_events: [], visualizer_models: [] };
  nextId = 1;

  reset() {
    this.tables.visualizer_events = [];
    this.tables.visualizer_models = [];
    this.nextId = 1;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  batch(statements: FakeStatement[]) {
    return Promise.all(statements.map((s) => s.run()));
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeVisualizerModelsDb,
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

    if (/^SELECT 1 as found FROM visualizer_events WHERE translation_group_id = \? LIMIT 1$/i.test(sql)) {
      const [groupId] = this.params;
      return this.db.tables.visualizer_events.some((r) => r.translation_group_id === groupId) ? [{ found: 1 }] : [];
    }

    if (/^SELECT .* FROM visualizer_models WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.visualizer_models.filter((r) => r.id === id);
    }

    if (/^SELECT .* FROM visualizer_models WHERE is_base_earth = 1 LIMIT 1$/i.test(sql)) {
      return this.db.tables.visualizer_models.filter((r) => r.is_base_earth === 1).slice(0, 1);
    }

    if (/^INSERT INTO visualizer_models/i.test(sql)) {
      const [id, event_group_id, title, r2_key, filename, mime_type, file_size, is_base_earth, sort_order] = this.params;
      const row: Row = {
        id, event_group_id, title, r2_key, filename, mime_type, file_size, is_base_earth, sort_order,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      this.db.tables.visualizer_models.push(row);
      return [row];
    }

    // setBaseEarthModel's two UPDATE statements (unset-then-set).
    if (/^UPDATE visualizer_models SET is_base_earth = 0 WHERE is_base_earth = 1 AND id != \?$/i.test(sql)) {
      const [excludeId] = this.params;
      const affected: Row[] = [];
      for (const row of this.db.tables.visualizer_models) {
        if (row.is_base_earth === 1 && row.id !== excludeId) {
          row.is_base_earth = 0;
          affected.push(row);
        }
      }
      return affected;
    }
    if (/^UPDATE visualizer_models SET is_base_earth = 1 WHERE id = \?$/i.test(sql)) {
      const [id] = this.params;
      const row = this.db.tables.visualizer_models.find((r) => r.id === id);
      if (row) row.is_base_earth = 1;
      return row ? [row] : [];
    }

    throw new Error(`FakeVisualizerModelsDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeVisualizerModelsDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

vi.mock('../mappers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mappers')>();
  let counter = 0;
  return { ...actual, genId: () => `model-${++counter}` };
});

const { createVisualizerModel, setBaseEarthModel } = await import('./visualizerModels');

/** This suite only needs the existence-check query (SELECT 1 ... WHERE
 * translation_group_id = ?) to see a matching row -- seeding a plain fake
 * row directly is simpler and more isolated than routing through the real
 * visualizerEvents.ts repository (which has its own, separately-tested,
 * more elaborate INSERT statement shape this fake DB doesn't need to
 * duplicate here). */
function seedEvent(translationGroupId: string) {
  fakeDb.tables.visualizer_events.push({ id: `event-${translationGroupId}`, translation_group_id: translationGroupId });
}

describe('createVisualizerModel', () => {
  beforeEach(() => fakeDb.reset());

  it('creates a model with no eventGroupId (standalone / base earth candidate)', async () => {
    const model = await createVisualizerModel({ r2Key: 'media/visualizer/models/x.glb' });
    expect(model.eventGroupId).toBeNull();
  });

  it('accepts an eventGroupId that matches a real event translation group', async () => {
    seedEvent('group-khreshchennya-rusi');
    const model = await createVisualizerModel({ r2Key: 'media/visualizer/models/kyiv.glb', eventGroupId: 'group-khreshchennya-rusi' });
    expect(model.eventGroupId).toBe('group-khreshchennya-rusi');
  });

  it('rejects an eventGroupId that does not match any existing event', async () => {
    await expect(
      createVisualizerModel({ r2Key: 'media/visualizer/models/x.glb', eventGroupId: 'nonexistent-group' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('setBaseEarthModel', () => {
  beforeEach(() => fakeDb.reset());

  it('marks the given model as the base earth model', async () => {
    const model = await createVisualizerModel({ r2Key: 'media/visualizer/models/earth.glb' });
    const result = await setBaseEarthModel(model.id);
    expect(result.isBaseEarth).toBe(true);
  });

  it('unsets the previously-active base earth model when a new one is set', async () => {
    const first = await createVisualizerModel({ r2Key: 'media/visualizer/models/earth-v1.glb' });
    await setBaseEarthModel(first.id);
    const second = await createVisualizerModel({ r2Key: 'media/visualizer/models/earth-v2.glb' });
    const result = await setBaseEarthModel(second.id);

    expect(result.isBaseEarth).toBe(true);
    const stillActiveCount = fakeDb.tables.visualizer_models.filter((r) => r.is_base_earth === 1).length;
    expect(stillActiveCount).toBe(1);
  });
});
