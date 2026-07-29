import { d1All, d1First, d1FirstConflictAware, d1Run } from '../db';
import { ApiError } from '../errors';
import { fromD1Json, resolveUuidSentinel, SVETIKONY_SITE_ID, toD1Bool, toD1Json } from '../mappers';
import { slugify } from '../slug';

/** Mirrors assistant/src/interfaces/http/church_orders.rs list_products /
 * get_product / create_product / update_product / delete_product.
 * Physically still `icon_order_options` (see 0001_svetikony_schema.sql —
 * kept as-is to avoid breaking icon_order_items.option_id). */

type Row = {
  id: string;
  slug: string;
  name_uk: string;
  name_ru: string;
  name_en: string;
  description: string;
  category_id: string | null;
  linked_icon_translation_group_id: string | null;
  full_description_uk: string;
  full_description_ru: string;
  full_description_en: string;
  gallery_urls: string;
  photo_url: string;
  price_cents: number;
  currency: string;
  production_time: string;
  consecration_available: number;
  stock_status: string;
  featured: number;
  seo_title_uk: string;
  seo_title_ru: string;
  seo_title_en: string;
  seo_description_uk: string;
  seo_description_ru: string;
  seo_description_en: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChurchProductDto = {
  id: string;
  siteId: string;
  slug: string;
  nameUk: string;
  nameRu: string;
  nameEn: string;
  description: string;
  categoryId: string | null;
  linkedIconTranslationGroupId: string | null;
  fullDescriptionUk: string;
  fullDescriptionRu: string;
  fullDescriptionEn: string;
  galleryUrls: string[];
  photoUrl: string;
  priceCents: number;
  currency: string;
  productionTime: string;
  consecrationAvailable: boolean;
  stockStatus: string;
  featured: boolean;
  seoTitleUk: string;
  seoTitleRu: string;
  seoTitleEn: string;
  seoDescriptionUk: string;
  seoDescriptionRu: string;
  seoDescriptionEn: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ChurchProductPayload = Partial<{
  slug: string;
  nameUk: string;
  nameRu: string;
  nameEn: string;
  description: string;
  /** Sentinel (see resolveUuidSentinel): omitted = don't touch, "" = clear, else new id. */
  categoryId: string;
  linkedIconTranslationGroupId: string;
  fullDescriptionUk: string;
  fullDescriptionRu: string;
  fullDescriptionEn: string;
  galleryUrls: string[];
  photoUrl: string;
  priceCents: number;
  currency: string;
  productionTime: string;
  consecrationAvailable: boolean;
  stockStatus: string;
  featured: boolean;
  seoTitleUk: string;
  seoTitleRu: string;
  seoTitleEn: string;
  seoDescriptionUk: string;
  seoDescriptionRu: string;
  seoDescriptionEn: string;
  isActive: boolean;
  sortOrder: number;
}>;

const STOCK_STATUSES = ['available', 'made_to_order', 'unavailable'];

function validateStockStatus(value: string) {
  if (!STOCK_STATUSES.includes(value)) {
    throw ApiError.validation(`stockStatus must be one of: ${STOCK_STATUSES.join(', ')}`);
  }
}

async function linkedIconGroupExists(groupId: string): Promise<boolean> {
  const row = await d1First<{ found: number }>(
    'SELECT EXISTS(SELECT 1 FROM church_icons WHERE translation_group_id = ?) AS found',
    groupId
  );
  return row?.found === 1;
}

function toDto(row: Row): ChurchProductDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    slug: row.slug,
    nameUk: row.name_uk,
    nameRu: row.name_ru,
    nameEn: row.name_en,
    description: row.description,
    categoryId: row.category_id,
    linkedIconTranslationGroupId: row.linked_icon_translation_group_id,
    fullDescriptionUk: row.full_description_uk,
    fullDescriptionRu: row.full_description_ru,
    fullDescriptionEn: row.full_description_en,
    galleryUrls: fromD1Json<string[]>(row.gallery_urls, []),
    photoUrl: row.photo_url,
    priceCents: row.price_cents,
    currency: row.currency,
    productionTime: row.production_time,
    consecrationAvailable: row.consecration_available === 1,
    stockStatus: row.stock_status,
    featured: row.featured === 1,
    seoTitleUk: row.seo_title_uk,
    seoTitleRu: row.seo_title_ru,
    seoTitleEn: row.seo_title_en,
    seoDescriptionUk: row.seo_description_uk,
    seoDescriptionRu: row.seo_description_ru,
    seoDescriptionEn: row.seo_description_en,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, slug, name_uk, name_ru, name_en, description, category_id, linked_icon_translation_group_id, full_description_uk, full_description_ru, full_description_en, gallery_urls, photo_url, price_cents, currency, production_time, consecration_available, stock_status, featured, seo_title_uk, seo_title_ru, seo_title_en, seo_description_uk, seo_description_ru, seo_description_en, is_active, sort_order, created_at, updated_at';

export async function listProducts() {
  const rows = await d1All<Row>(`SELECT ${COLUMNS} FROM icon_order_options ORDER BY sort_order ASC, name_uk ASC`);
  return rows.map(toDto);
}

export async function getProduct(id: string): Promise<ChurchProductDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM icon_order_options WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('product not found');
  return toDto(row);
}

/** Used by order creation (church_orders.rs public_create_product_order):
 * an inactive/nonexistent product can't be ordered. */
export async function getActiveProductBySlug(slug: string): Promise<ChurchProductDto | null> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM icon_order_options WHERE slug = ? AND is_active = 1`, slug);
  return row ? toDto(row) : null;
}

/** Used by order creation to resolve the add-on items a customer picked —
 * mirrors Postgres's `WHERE id = ANY($1) AND is_active = true`. SQLite has
 * no array bind parameter, so this builds a plain `IN (?, ?, ...)` instead. */
export async function getActiveProductsByIds(ids: string[]): Promise<ChurchProductDto[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await d1All<Row>(`SELECT ${COLUMNS} FROM icon_order_options WHERE id IN (${placeholders}) AND is_active = 1`, ...ids);
  return rows.map(toDto);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createProduct(payload: ChurchProductPayload): Promise<ChurchProductDto> {
  const nameUk = required(payload.nameUk, 'nameUk');
  const slug = payload.slug?.trim() || slugify(nameUk, 'product');

  if ((payload.priceCents ?? 0) < 0) throw ApiError.validation('priceCents must not be negative');
  const stockStatus = payload.stockStatus ?? 'available';
  validateStockStatus(stockStatus);

  const linkedIconGroup = resolveUuidSentinel(payload.linkedIconTranslationGroupId, null);
  if (linkedIconGroup && !(await linkedIconGroupExists(linkedIconGroup))) {
    throw ApiError.validation('linkedIconTranslationGroupId does not match any icon');
  }

  const row = await d1FirstConflictAware<Row>(
    `INSERT INTO icon_order_options
       (slug, name_uk, name_ru, name_en, description, category_id, linked_icon_translation_group_id,
        full_description_uk, full_description_ru, full_description_en, gallery_urls, photo_url, price_cents,
        currency, production_time, consecration_available, stock_status, featured, seo_title_uk, seo_title_ru,
        seo_title_en, seo_description_uk, seo_description_ru, seo_description_en, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    slug,
    nameUk,
    payload.nameRu ?? '',
    payload.nameEn ?? '',
    payload.description ?? '',
    resolveUuidSentinel(payload.categoryId, null),
    linkedIconGroup,
    payload.fullDescriptionUk ?? '',
    payload.fullDescriptionRu ?? '',
    payload.fullDescriptionEn ?? '',
    toD1Json(payload.galleryUrls ?? []),
    payload.photoUrl ?? '',
    payload.priceCents ?? 0,
    payload.currency ?? 'UAH',
    payload.productionTime ?? '',
    toD1Bool(payload.consecrationAvailable),
    stockStatus,
    toD1Bool(payload.featured),
    payload.seoTitleUk ?? '',
    payload.seoTitleRu ?? '',
    payload.seoTitleEn ?? '',
    payload.seoDescriptionUk ?? '',
    payload.seoDescriptionRu ?? '',
    payload.seoDescriptionEn ?? '',
    toD1Bool(payload.isActive ?? true),
    payload.sortOrder ?? 0
  );
  return toDto(row!);
}

export async function updateProduct(id: string, payload: ChurchProductPayload): Promise<ChurchProductDto> {
  const current = await getProduct(id);

  if (payload.priceCents !== undefined && payload.priceCents < 0) {
    throw ApiError.validation('priceCents must not be negative');
  }
  const stockStatus = payload.stockStatus ?? current.stockStatus;
  validateStockStatus(stockStatus);

  const linkedIconGroup = resolveUuidSentinel(payload.linkedIconTranslationGroupId, current.linkedIconTranslationGroupId);
  if (linkedIconGroup && linkedIconGroup !== current.linkedIconTranslationGroupId && !(await linkedIconGroupExists(linkedIconGroup))) {
    throw ApiError.validation('linkedIconTranslationGroupId does not match any icon');
  }

  const row = await d1FirstConflictAware<Row>(
    `UPDATE icon_order_options SET
       slug = ?, name_uk = ?, name_ru = ?, name_en = ?, description = ?, category_id = ?,
       linked_icon_translation_group_id = ?, full_description_uk = ?, full_description_ru = ?,
       full_description_en = ?, gallery_urls = ?, photo_url = ?, price_cents = ?, currency = ?,
       production_time = ?, consecration_available = ?, stock_status = ?, featured = ?, seo_title_uk = ?,
       seo_title_ru = ?, seo_title_en = ?, seo_description_uk = ?, seo_description_ru = ?, seo_description_en = ?,
       is_active = ?, sort_order = ?
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.slug?.trim() || current.slug,
    payload.nameUk?.trim() || current.nameUk,
    payload.nameRu ?? current.nameRu,
    payload.nameEn ?? current.nameEn,
    payload.description ?? current.description,
    resolveUuidSentinel(payload.categoryId, current.categoryId),
    linkedIconGroup,
    payload.fullDescriptionUk ?? current.fullDescriptionUk,
    payload.fullDescriptionRu ?? current.fullDescriptionRu,
    payload.fullDescriptionEn ?? current.fullDescriptionEn,
    toD1Json(payload.galleryUrls ?? current.galleryUrls),
    payload.photoUrl ?? current.photoUrl,
    payload.priceCents ?? current.priceCents,
    payload.currency ?? current.currency,
    payload.productionTime ?? current.productionTime,
    toD1Bool(payload.consecrationAvailable ?? current.consecrationAvailable),
    stockStatus,
    toD1Bool(payload.featured ?? current.featured),
    payload.seoTitleUk ?? current.seoTitleUk,
    payload.seoTitleRu ?? current.seoTitleRu,
    payload.seoTitleEn ?? current.seoTitleEn,
    payload.seoDescriptionUk ?? current.seoDescriptionUk,
    payload.seoDescriptionRu ?? current.seoDescriptionRu,
    payload.seoDescriptionEn ?? current.seoDescriptionEn,
    toD1Bool(payload.isActive ?? current.isActive),
    payload.sortOrder ?? current.sortOrder,
    id
  );
  return toDto(row!);
}

export async function deleteProduct(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM icon_order_options WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('product not found');
}
