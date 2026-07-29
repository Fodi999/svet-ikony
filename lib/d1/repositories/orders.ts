import { d1All, d1Batch, d1First, d1Prepare, d1Run } from '../db';
import { ApiError } from '../errors';
import { fromD1Bool, genId, IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID, toD1Bool } from '../mappers';
import { getIcon } from './icons';
import { getActiveProductBySlug, getActiveProductsByIds, type ChurchProductDto } from './products';

/** Mirrors assistant/src/interfaces/http/church_orders.rs list_icon_orders /
 * get_icon_order / update_icon_order / mark_icon_order_read /
 * count_unread_icon_orders / public_create_icon_order /
 * public_create_product_order.
 *
 * The two `public_create_*` handlers are the one place in this whole port
 * that used a real Postgres transaction (`pool.begin()` -> insert order,
 * using `nextval()` for order_number -> insert N order_items -> commit).
 * D1 has no interactive transaction — only `batch()`, which requires every
 * statement's parameters to already be known (see MIGRATION_PLAN.md /
 * db.ts). So here: the order id and every item id are generated up front
 * with genId(), the order number is claimed via one atomic
 * `UPDATE icon_order_counters ... RETURNING next_value`, and then the order
 * row + every item row go into a single d1Batch() call. */

type OrderRow = {
  id: string;
  order_number: string;
  icon_id: string | null;
  icon_title_snapshot: string;
  icon_slug_snapshot: string;
  primary_product_id: string | null;
  primary_product_name_snapshot: string;
  primary_product_slug_snapshot: string;
  primary_product_price_cents_snapshot: number;
  primary_product_photo_snapshot: string;
  customer_name: string;
  contact_method: string;
  contact_value: string;
  preferred_contact_channel: string;
  country: string;
  city: string;
  consecration_requested: number;
  comment: string;
  consent_given: number;
  status: string;
  admin_note: string;
  total_price_cents: number;
  currency: string;
  is_read: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  option_id: string | null;
  option_name_snapshot: string;
  price_cents_snapshot: number;
  quantity: number;
};

export type ChurchIconOrderRowDto = {
  id: string;
  siteId: string;
  isGlobal: boolean;
  orderNumber: string;
  iconId: string | null;
  iconTitleSnapshot: string;
  iconSlugSnapshot: string;
  primaryProductId: string | null;
  primaryProductNameSnapshot: string;
  primaryProductSlugSnapshot: string;
  primaryProductPriceCentsSnapshot: number;
  primaryProductPhotoSnapshot: string;
  customerName: string;
  contactMethod: string;
  contactValue: string;
  preferredContactChannel: string;
  country: string;
  city: string;
  consecrationRequested: boolean;
  comment: string;
  consentGiven: boolean;
  status: string;
  adminNote: string;
  totalPriceCents: number;
  currency: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IconOrderItemDto = {
  id: string;
  orderId: string;
  optionId: string | null;
  optionNameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
};

export type ChurchIconOrderDto = ChurchIconOrderRowDto & { items: IconOrderItemDto[] };

const ORDER_COLUMNS =
  'id, order_number, icon_id, icon_title_snapshot, icon_slug_snapshot, primary_product_id, primary_product_name_snapshot, primary_product_slug_snapshot, primary_product_price_cents_snapshot, primary_product_photo_snapshot, customer_name, contact_method, contact_value, preferred_contact_channel, country, city, consecration_requested, comment, consent_given, status, admin_note, total_price_cents, currency, is_read, created_at, updated_at';
const ITEM_COLUMNS = 'id, order_id, option_id, option_name_snapshot, price_cents_snapshot, quantity';

const ORDER_STATUSES = ['new', 'contacted', 'confirmed', 'in_production', 'ready', 'shipped', 'completed', 'cancelled'];

function orderToDto(row: OrderRow): ChurchIconOrderRowDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    isGlobal: IS_GLOBAL_DEFAULT,
    orderNumber: row.order_number,
    iconId: row.icon_id,
    iconTitleSnapshot: row.icon_title_snapshot,
    iconSlugSnapshot: row.icon_slug_snapshot,
    primaryProductId: row.primary_product_id,
    primaryProductNameSnapshot: row.primary_product_name_snapshot,
    primaryProductSlugSnapshot: row.primary_product_slug_snapshot,
    primaryProductPriceCentsSnapshot: row.primary_product_price_cents_snapshot,
    primaryProductPhotoSnapshot: row.primary_product_photo_snapshot,
    customerName: row.customer_name,
    contactMethod: row.contact_method,
    contactValue: row.contact_value,
    preferredContactChannel: row.preferred_contact_channel,
    country: row.country,
    city: row.city,
    consecrationRequested: fromD1Bool(row.consecration_requested),
    comment: row.comment,
    consentGiven: fromD1Bool(row.consent_given),
    status: row.status,
    adminNote: row.admin_note,
    totalPriceCents: row.total_price_cents,
    currency: row.currency,
    isRead: fromD1Bool(row.is_read),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemToDto(row: ItemRow): IconOrderItemDto {
  return {
    id: row.id,
    orderId: row.order_id,
    optionId: row.option_id,
    optionNameSnapshot: row.option_name_snapshot,
    priceCentsSnapshot: row.price_cents_snapshot,
    quantity: row.quantity,
  };
}

async function itemsForOrder(orderId: string): Promise<IconOrderItemDto[]> {
  const rows = await d1All<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM icon_order_items WHERE order_id = ?`, orderId);
  return rows.map(itemToDto);
}

export async function listIconOrders(): Promise<ChurchIconOrderDto[]> {
  const orders = await d1All<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM icon_orders ORDER BY created_at DESC`);
  if (orders.length === 0) return [];
  const placeholders = orders.map(() => '?').join(', ');
  const items = await d1All<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM icon_order_items WHERE order_id IN (${placeholders})`,
    ...orders.map((o) => o.id)
  );
  const byOrder = new Map<string, IconOrderItemDto[]>();
  for (const item of items.map(itemToDto)) {
    if (!byOrder.has(item.orderId)) byOrder.set(item.orderId, []);
    byOrder.get(item.orderId)!.push(item);
  }
  return orders.map((order) => ({ ...orderToDto(order), items: byOrder.get(order.id) ?? [] }));
}

async function getOrderRow(id: string): Promise<OrderRow> {
  const row = await d1First<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM icon_orders WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('order not found');
  return row;
}

export async function getIconOrder(id: string): Promise<ChurchIconOrderDto> {
  const row = await getOrderRow(id);
  return { ...orderToDto(row), items: await itemsForOrder(row.id) };
}

export async function updateIconOrder(id: string, payload: { status?: string; adminNote?: string }): Promise<ChurchIconOrderDto> {
  if (payload.status !== undefined && !ORDER_STATUSES.includes(payload.status)) {
    throw ApiError.validation(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }
  const current = await getOrderRow(id);
  const row = await d1First<OrderRow>(
    `UPDATE icon_orders SET status = ?, admin_note = ? WHERE id = ? RETURNING ${ORDER_COLUMNS}`,
    payload.status ?? current.status,
    payload.adminNote ?? current.admin_note,
    id
  );
  return { ...orderToDto(row!), items: await itemsForOrder(row!.id) };
}

export async function markIconOrderRead(id: string): Promise<void> {
  const result = await d1Run('UPDATE icon_orders SET is_read = 1 WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('order not found');
}

export async function countUnreadIconOrders(): Promise<number> {
  const row = await d1First<{ count: number }>('SELECT count(*) AS count FROM icon_orders WHERE is_read = 0');
  return row?.count ?? 0;
}

// ── Public order creation ────────────────────────────────────────────────────

function productLabel(product: ChurchProductDto): string {
  if (product.nameUk.trim()) return product.nameUk;
  if (product.nameRu.trim()) return product.nameRu;
  return product.nameEn;
}

export function extractIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();
  return null;
}

async function claimNextOrderNumber(): Promise<string> {
  const row = await d1First<{ next_value: number }>(
    'UPDATE icon_order_counters SET next_value = next_value + 1 WHERE id = 1 RETURNING next_value'
  );
  const value = row!.next_value;
  return `IK-${String(value).padStart(6, '0')}`;
}

function validateOrderContactFields(input: { customerName: string; contactMethod: string; contactValue: string; consentGiven: boolean }) {
  const customerName = input.customerName.trim();
  const contactValue = input.contactValue.trim();
  if (!customerName || !contactValue) throw ApiError.validation('customerName and contactValue are required');
  if (input.contactMethod !== 'phone' && input.contactMethod !== 'email') {
    throw ApiError.validation('contactMethod must be "phone" or "email"');
  }
  if (input.contactMethod === 'email' && !(contactValue.includes('@') && contactValue.includes('.'))) {
    throw ApiError.validation('contactValue is not a valid email');
  }
  if (!input.consentGiven) throw ApiError.validation('consentGiven is required');
  return { customerName, contactValue };
}

export type CreateIconOrderPayload = {
  iconId: string;
  customerName: string;
  contactMethod: string;
  contactValue: string;
  preferredContactChannel?: string;
  country?: string;
  city?: string;
  consecrationRequested?: boolean;
  comment?: string;
  consentGiven: boolean;
  items?: { optionId: string; quantity?: number }[];
  /** Honeypot: real visitors never see or fill this field. */
  website?: string;
};

export async function createIconOrder(payload: CreateIconOrderPayload, headers: Headers): Promise<{ orderNumber: string }> {
  if (payload.website?.trim()) {
    // Honeypot tripped: fake success, no signal back to the bot.
    return { orderNumber: '' };
  }
  const { customerName, contactValue } = validateOrderContactFields(payload);

  const icon = await getIcon(payload.iconId).catch(() => null);
  if (!icon) throw ApiError.validation('iconId does not exist');
  if (!icon.orderEnabled) throw ApiError.validation('ordering is not enabled for this icon');

  const optionIds = (payload.items ?? []).map((item) => item.optionId);
  const options = await getActiveProductsByIds(optionIds);

  const iconPrice = icon.priceCents ?? 0;
  let optionsTotal = 0;
  const resolvedItems: { optionId: string; nameSnapshot: string; priceSnapshot: number; quantity: number }[] = [];
  for (const item of payload.items ?? []) {
    const option = options.find((candidate) => candidate.id === item.optionId);
    if (!option) continue;
    const quantity = Math.max(item.quantity ?? 1, 1);
    optionsTotal += option.priceCents * quantity;
    resolvedItems.push({ optionId: option.id, nameSnapshot: productLabel(option), priceSnapshot: option.priceCents, quantity });
  }

  const totalPriceCents = iconPrice + optionsTotal;
  const currency = icon.currency.trim() || 'UAH';
  const clientIp = extractIpFromHeaders(headers);

  const orderNumber = await claimNextOrderNumber();
  const orderId = genId();

  const statements = [
    await d1Prepare(
      `INSERT INTO icon_orders
         (id, order_number, icon_id, icon_title_snapshot, icon_slug_snapshot, customer_name, contact_method,
          contact_value, preferred_contact_channel, country, city, consecration_requested, comment, consent_given,
          total_price_cents, currency, client_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      orderNumber,
      icon.id,
      icon.title,
      icon.slug,
      customerName,
      payload.contactMethod,
      contactValue,
      payload.preferredContactChannel ?? '',
      payload.country ?? '',
      payload.city ?? '',
      toD1Bool(payload.consecrationRequested),
      payload.comment ?? '',
      toD1Bool(payload.consentGiven),
      totalPriceCents,
      currency,
      clientIp
    ),
    ...(await Promise.all(
      resolvedItems.map((item) =>
        d1Prepare(
          `INSERT INTO icon_order_items (id, order_id, option_id, option_name_snapshot, price_cents_snapshot, quantity)
           VALUES (?, ?, ?, ?, ?, ?)`,
          genId(),
          orderId,
          item.optionId,
          item.nameSnapshot,
          item.priceSnapshot,
          item.quantity
        )
      )
    )),
  ];
  await d1Batch(statements);

  return { orderNumber };
}

export type CreateProductOrderPayload = {
  productSlug: string;
  customerName: string;
  contactMethod: string;
  contactValue: string;
  preferredContactChannel?: string;
  country?: string;
  city?: string;
  consecrationRequested?: boolean;
  comment?: string;
  consentGiven: boolean;
  items?: { productId: string; quantity?: number }[];
  website?: string;
};

export async function createProductOrder(payload: CreateProductOrderPayload, headers: Headers): Promise<{ orderNumber: string }> {
  if (payload.website?.trim()) {
    return { orderNumber: '' };
  }
  const { customerName, contactValue } = validateOrderContactFields(payload);

  const product = await getActiveProductBySlug(payload.productSlug.trim());
  if (!product) throw ApiError.validation('productSlug does not exist or is inactive');

  const itemIds = (payload.items ?? []).map((item) => item.productId);
  const itemProducts = await getActiveProductsByIds(itemIds);

  let itemsTotal = 0;
  const resolvedItems: { optionId: string; nameSnapshot: string; priceSnapshot: number; quantity: number }[] = [];
  for (const item of payload.items ?? []) {
    const found = itemProducts.find((candidate) => candidate.id === item.productId);
    if (!found) continue;
    const quantity = Math.max(item.quantity ?? 1, 1);
    itemsTotal += found.priceCents * quantity;
    resolvedItems.push({ optionId: found.id, nameSnapshot: productLabel(found), priceSnapshot: found.priceCents, quantity });
  }

  const totalPriceCents = product.priceCents + itemsTotal;
  const currency = product.currency.trim() || 'UAH';
  const clientIp = extractIpFromHeaders(headers);

  // Best-effort: if the product links back to an icon, snapshot that icon
  // too so the admin order list keeps showing "which icon" for continuity
  // with icon-only orders created through the older endpoint.
  let iconId: string | null = null;
  let iconTitleSnapshot = '';
  let iconSlugSnapshot = '';
  if (product.linkedIconTranslationGroupId) {
    const icon = await d1First<{ id: string; title: string; slug: string }>(
      `SELECT id, title, slug FROM church_icons
       WHERE translation_group_id = ? AND status = 'published'
       ORDER BY CASE WHEN language = 'uk' THEN 0 ELSE 1 END LIMIT 1`,
      product.linkedIconTranslationGroupId
    );
    if (icon) {
      iconId = icon.id;
      iconTitleSnapshot = icon.title;
      iconSlugSnapshot = icon.slug;
    }
  }

  const orderNumber = await claimNextOrderNumber();
  const orderId = genId();

  const statements = [
    await d1Prepare(
      `INSERT INTO icon_orders
         (id, order_number, icon_id, icon_title_snapshot, icon_slug_snapshot,
          primary_product_id, primary_product_name_snapshot, primary_product_slug_snapshot,
          primary_product_price_cents_snapshot, primary_product_photo_snapshot,
          customer_name, contact_method, contact_value, preferred_contact_channel,
          country, city, consecration_requested, comment, consent_given, total_price_cents, currency, client_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      orderNumber,
      iconId,
      iconTitleSnapshot,
      iconSlugSnapshot,
      product.id,
      productLabel(product),
      product.slug,
      product.priceCents,
      product.photoUrl,
      customerName,
      payload.contactMethod,
      contactValue,
      payload.preferredContactChannel ?? '',
      payload.country ?? '',
      payload.city ?? '',
      toD1Bool(payload.consecrationRequested),
      payload.comment ?? '',
      toD1Bool(payload.consentGiven),
      totalPriceCents,
      currency,
      clientIp
    ),
    ...(await Promise.all(
      resolvedItems.map((item) =>
        d1Prepare(
          `INSERT INTO icon_order_items (id, order_id, option_id, option_name_snapshot, price_cents_snapshot, quantity)
           VALUES (?, ?, ?, ?, ?, ?)`,
          genId(),
          orderId,
          item.optionId,
          item.nameSnapshot,
          item.priceSnapshot,
          item.quantity
        )
      )
    )),
  ];
  await d1Batch(statements);

  return { orderNumber };
}
