import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Purpose-built local fake for createProductOrder()'s exact statement
 * shapes -- same house style as lib/d1/test-support/mock-d1-database.ts
 * (a small hand-rolled fake, not a general SQL engine), kept separate
 * since icon_orders/icon_order_options/icon_order_items/church_icons are
 * unrelated to the admin-auth tables that fake already covers.
 *
 * Column set for icon_orders/icon_order_options was cross-checked directly
 * against the REAL production D1 schema (PRAGMA table_info via `wrangler
 * d1 execute --remote`) during this bug's diagnosis, not assumed from the
 * migration file alone -- see the PRODUCTION DIAGNOSIS report. Both
 * matched exactly; this fake mirrors that confirmed-real column set.
 */
type Row = Record<string, unknown>;

class FakeOrdersDb {
  tables: {
    icon_order_options: Row[];
    icon_orders: Row[];
    icon_order_items: Row[];
    icon_order_counters: Row[];
    church_icons: Row[];
  } = {
    icon_order_options: [],
    icon_orders: [],
    icon_order_items: [],
    icon_order_counters: [{ id: 1, next_value: 0 }],
    church_icons: [],
  };

  reset() {
    this.tables.icon_order_options = [];
    this.tables.icon_orders = [];
    this.tables.icon_order_items = [];
    this.tables.icon_order_counters = [{ id: 1, next_value: 0 }];
    this.tables.church_icons = [];
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    return statements.map((stmt) => stmt.executeForBatch());
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private readonly db: FakeOrdersDb,
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
    this.execute();
    return { success: true, meta: { changes: this.writeCount, last_row_id: 0 } };
  }

  executeForBatch(): { success: true; meta: { changes: number; last_row_id: number } } {
    this.execute();
    return { success: true, meta: { changes: this.writeCount, last_row_id: 0 } };
  }

  private writeCount = 0;

  private execute(): Row[] {
    const sql = this.sql.replace(/\s+/g, ' ').trim();

    if (/^SELECT .* FROM icon_order_options WHERE slug = \? AND is_active = 1/i.test(sql)) {
      const [slug] = this.params;
      return this.db.tables.icon_order_options.filter((r) => r.slug === slug && r.is_active === 1);
    }

    if (/^SELECT .* FROM icon_order_options WHERE id IN \(/i.test(sql)) {
      const ids = this.params as string[];
      return this.db.tables.icon_order_options.filter((r) => ids.includes(r.id as string) && r.is_active === 1);
    }

    if (/^SELECT id, title, slug FROM church_icons WHERE translation_group_id = \?/i.test(sql)) {
      const [groupId] = this.params;
      const matches = this.db.tables.church_icons.filter((r) => r.translation_group_id === groupId && r.status === 'published');
      const preferred = matches.find((r) => r.language === 'uk') ?? matches[0];
      return preferred ? [preferred] : [];
    }

    if (/^UPDATE icon_order_counters SET next_value = next_value \+ 1 WHERE id = 1/i.test(sql)) {
      const row = this.db.tables.icon_order_counters.find((r) => r.id === 1)!;
      row.next_value = (row.next_value as number) + 1;
      this.writeCount = 1;
      return [{ next_value: row.next_value }];
    }

    if (/^INSERT INTO icon_orders/i.test(sql)) {
      const [
        id, order_number, icon_id, icon_title_snapshot, icon_slug_snapshot,
        primary_product_id, primary_product_name_snapshot, primary_product_slug_snapshot,
        primary_product_price_cents_snapshot, primary_product_photo_snapshot,
        customer_name, contact_method, contact_value, preferred_contact_channel,
        country, city, consecration_requested, comment, consent_given, total_price_cents, currency, client_ip,
      ] = this.params;
      this.db.tables.icon_orders.push({
        id, order_number, icon_id, icon_title_snapshot, icon_slug_snapshot,
        primary_product_id, primary_product_name_snapshot, primary_product_slug_snapshot,
        primary_product_price_cents_snapshot, primary_product_photo_snapshot,
        customer_name, contact_method, contact_value, preferred_contact_channel,
        country, city, consecration_requested, comment, consent_given, total_price_cents, currency, client_ip,
        status: 'new', admin_note: '', is_read: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      this.writeCount = 1;
      return [];
    }

    if (/^INSERT INTO icon_order_items/i.test(sql)) {
      const [id, order_id, option_id, option_name_snapshot, price_cents_snapshot, quantity] = this.params;
      this.db.tables.icon_order_items.push({ id, order_id, option_id, option_name_snapshot, price_cents_snapshot, quantity });
      this.writeCount = 1;
      return [];
    }

    throw new Error(`FakeOrdersDb: unrecognized statement shape: ${sql}`);
  }
}

const fakeDb = new FakeOrdersDb();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb } }),
}));

const { createProductOrder } = await import('./orders');

function seedProduct(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: overrides.id ?? 'product-1',
    slug: overrides.slug ?? 'ikona-sviatoi-velykomuchenytsi-varvary',
    name_uk: overrides.name_uk ?? 'Ікона Святої великомучениці Варвари',
    name_ru: overrides.name_ru ?? '',
    name_en: overrides.name_en ?? '',
    photo_url: overrides.photo_url ?? 'media/products/1/photo.png',
    price_cents: overrides.price_cents ?? 1500,
    currency: overrides.currency ?? 'UAH',
    is_active: overrides.is_active ?? 1,
    sort_order: 0,
    category_id: null,
    description: '',
    linked_icon_translation_group_id: overrides.linked_icon_translation_group_id ?? null,
    full_description_uk: '', full_description_ru: '', full_description_en: '',
    gallery_urls: '[]',
    production_time: '',
    consecration_available: 1,
    stock_status: 'available',
    featured: 0,
    seo_title_uk: '', seo_title_ru: '', seo_title_en: '',
    seo_description_uk: '', seo_description_ru: '', seo_description_en: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  fakeDb.tables.icon_order_options.push(row);
  return row;
}

function samplePayload(overrides: Partial<Parameters<typeof createProductOrder>[0]> = {}) {
  return {
    productSlug: 'ikona-sviatoi-velykomuchenytsi-varvary',
    customerName: 'Dmytro Fomin',
    contactMethod: 'phone',
    contactValue: '+48576212418',
    consentGiven: true,
    ...overrides,
  };
}

const HEADERS = new Headers();

describe('createProductOrder', () => {
  beforeEach(() => fakeDb.reset());

  it('valid product order creates the order and returns a real order number', async () => {
    seedProduct();
    const result = await createProductOrder(samplePayload(), HEADERS);
    expect(result.orderNumber).toMatch(/^IK-\d{6}$/);
    expect(fakeDb.tables.icon_orders).toHaveLength(1);
  });

  it('order number generation increments the shared counter sequentially', async () => {
    seedProduct();
    const first = await createProductOrder(samplePayload(), HEADERS);
    const second = await createProductOrder(samplePayload(), HEADERS);
    const firstNum = Number(first.orderNumber.replace('IK-', ''));
    const secondNum = Number(second.orderNumber.replace('IK-', ''));
    expect(secondNum).toBe(firstNum + 1);
  });

  it('inactive product is rejected -- productSlug does not exist or is inactive', async () => {
    seedProduct({ is_active: 0 });
    await expect(createProductOrder(samplePayload(), HEADERS)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fakeDb.tables.icon_orders).toHaveLength(0);
  });

  it('unknown slug is rejected the same way as an inactive product', async () => {
    // No product seeded at all.
    await expect(createProductOrder(samplePayload({ productSlug: 'does-not-exist' }), HEADERS)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('phone contact accepts any non-empty value', async () => {
    seedProduct();
    const result = await createProductOrder(samplePayload({ contactMethod: 'phone', contactValue: '+380671234567' }), HEADERS);
    expect(result.orderNumber).toBeTruthy();
    expect(fakeDb.tables.icon_orders[0]!.contact_method).toBe('phone');
  });

  it('email contact requires a value containing "@" and "."', async () => {
    seedProduct();
    await expect(createProductOrder(samplePayload({ contactMethod: 'email', contactValue: 'not-an-email' }), HEADERS)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const result = await createProductOrder(samplePayload({ contactMethod: 'email', contactValue: 'real@example.com' }), HEADERS);
    expect(result.orderNumber).toBeTruthy();
  });

  it('consent false is rejected -- consentGiven is required', async () => {
    seedProduct();
    await expect(createProductOrder(samplePayload({ consentGiven: false }), HEADERS)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fakeDb.tables.icon_orders).toHaveLength(0);
  });

  it('optional fields (country/city/comment/preferredContactChannel) empty still creates the order, defaulting to empty strings', async () => {
    seedProduct();
    await createProductOrder(samplePayload(), HEADERS);
    const row = fakeDb.tables.icon_orders[0]!;
    expect(row.country).toBe('');
    expect(row.city).toBe('');
    expect(row.comment).toBe('');
    expect(row.preferred_contact_channel).toBe('');
  });

  it('consecration true is persisted as 1 (D1 boolean encoding)', async () => {
    seedProduct();
    await createProductOrder(samplePayload({ consecrationRequested: true }), HEADERS);
    expect(fakeDb.tables.icon_orders[0]!.consecration_requested).toBe(1);
  });

  it('consecration omitted defaults to 0', async () => {
    seedProduct();
    await createProductOrder(samplePayload(), HEADERS);
    expect(fakeDb.tables.icon_orders[0]!.consecration_requested).toBe(0);
  });

  it('snapshots the primary product name/slug/price/photo onto the order row at creation time', async () => {
    seedProduct({ name_uk: 'Ікона Святої великомучениці Варвари', slug: 'ikona-sviatoi-velykomuchenytsi-varvary', price_cents: 1500, photo_url: 'media/products/1/photo.png' });
    await createProductOrder(samplePayload(), HEADERS);
    const row = fakeDb.tables.icon_orders[0]!;
    expect(row.primary_product_name_snapshot).toBe('Ікона Святої великомучениці Варвари');
    expect(row.primary_product_slug_snapshot).toBe('ikona-sviatoi-velykomuchenytsi-varvary');
    expect(row.primary_product_price_cents_snapshot).toBe(1500);
    expect(row.primary_product_photo_snapshot).toBe('media/products/1/photo.png');
    expect(row.total_price_cents).toBe(1500);
  });

  it('order items batch: selected add-on products create icon_order_items rows and add to the total', async () => {
    seedProduct({ id: 'main-product', slug: 'main', price_cents: 1500 });
    seedProduct({ id: 'addon-1', slug: 'addon-1', name_uk: 'Свічка', price_cents: 200 });
    seedProduct({ id: 'addon-2', slug: 'addon-2', name_uk: 'Рамка', price_cents: 300 });

    await createProductOrder(
      samplePayload({ productSlug: 'main', items: [{ productId: 'addon-1' }, { productId: 'addon-2', quantity: 2 }] }),
      HEADERS,
    );

    expect(fakeDb.tables.icon_order_items).toHaveLength(2);
    const order = fakeDb.tables.icon_orders[0]!;
    // 1500 (main) + 200*1 (addon-1) + 300*2 (addon-2) = 2300
    expect(order.total_price_cents).toBe(2300);
    const orderId = order.id;
    expect(fakeDb.tables.icon_order_items.every((item) => item.order_id === orderId)).toBe(true);
  });

  it('an item referencing an inactive/unknown productId is silently skipped, not an error', async () => {
    seedProduct({ id: 'main-product', slug: 'main', price_cents: 1500 });
    const result = await createProductOrder(samplePayload({ productSlug: 'main', items: [{ productId: 'does-not-exist' }] }), HEADERS);
    expect(result.orderNumber).toBeTruthy();
    expect(fakeDb.tables.icon_order_items).toHaveLength(0);
  });

  it('the honeypot field (website) tripped returns a fake success without creating any order', async () => {
    seedProduct();
    const result = await createProductOrder(samplePayload({ website: 'https://spam.example.com' }), HEADERS);
    expect(result.orderNumber).toBe('');
    expect(fakeDb.tables.icon_orders).toHaveLength(0);
  });

  it('a product linked to a published icon snapshots that icon onto the order too', async () => {
    fakeDb.tables.church_icons.push({ id: 'icon-1', title: 'Ікона Варвари', slug: 'ikona-varvary', translation_group_id: 'group-1', status: 'published', language: 'uk' });
    seedProduct({ linked_icon_translation_group_id: 'group-1' });
    await createProductOrder(samplePayload(), HEADERS);
    const row = fakeDb.tables.icon_orders[0]!;
    expect(row.icon_id).toBe('icon-1');
    expect(row.icon_title_snapshot).toBe('Ікона Варвари');
    expect(row.icon_slug_snapshot).toBe('ikona-varvary');
  });

  it('a product with no linked icon leaves icon fields empty rather than erroring', async () => {
    seedProduct({ linked_icon_translation_group_id: null });
    await createProductOrder(samplePayload(), HEADERS);
    const row = fakeDb.tables.icon_orders[0]!;
    expect(row.icon_id).toBeNull();
    expect(row.icon_title_snapshot).toBe('');
    expect(row.icon_slug_snapshot).toBe('');
  });
});
