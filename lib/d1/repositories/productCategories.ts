import { d1All, d1First, d1FirstConflictAware, d1Run } from '../db';
import { ApiError } from '../errors';
import { SVETIKONY_SITE_ID, toD1Bool } from '../mappers';
import { slugify } from '../slug';

/** Mirrors assistant/src/interfaces/http/church_orders.rs
 * list_icon_product_categories / get_icon_product_category /
 * create_icon_product_category / update_icon_product_category /
 * delete_icon_product_category. */

type Row = {
  id: string;
  slug: string;
  name_uk: string;
  name_ru: string;
  name_en: string;
  description_uk: string;
  description_ru: string;
  description_en: string;
  image_url: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChurchProductCategoryDto = {
  id: string;
  siteId: string;
  slug: string;
  nameUk: string;
  nameRu: string;
  nameEn: string;
  descriptionUk: string;
  descriptionRu: string;
  descriptionEn: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ChurchProductCategoryPayload = Partial<{
  slug: string;
  nameUk: string;
  nameRu: string;
  nameEn: string;
  descriptionUk: string;
  descriptionRu: string;
  descriptionEn: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
}>;

function toDto(row: Row): ChurchProductCategoryDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    slug: row.slug,
    nameUk: row.name_uk,
    nameRu: row.name_ru,
    nameEn: row.name_en,
    descriptionUk: row.description_uk,
    descriptionRu: row.description_ru,
    descriptionEn: row.description_en,
    imageUrl: row.image_url,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, slug, name_uk, name_ru, name_en, description_uk, description_ru, description_en, image_url, is_active, sort_order, created_at, updated_at';

export async function listProductCategories() {
  const rows = await d1All<Row>(`SELECT ${COLUMNS} FROM icon_product_categories ORDER BY sort_order ASC, name_uk ASC`);
  return rows.map(toDto);
}

export async function getProductCategory(id: string): Promise<ChurchProductCategoryDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM icon_product_categories WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('product category not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createProductCategory(payload: ChurchProductCategoryPayload): Promise<ChurchProductCategoryDto> {
  const nameUk = required(payload.nameUk, 'nameUk');
  const slug = payload.slug?.trim() || slugify(nameUk, 'category');

  const row = await d1FirstConflictAware<Row>(
    `INSERT INTO icon_product_categories
       (slug, name_uk, name_ru, name_en, description_uk, description_ru, description_en, image_url, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    slug,
    nameUk,
    payload.nameRu ?? '',
    payload.nameEn ?? '',
    payload.descriptionUk ?? '',
    payload.descriptionRu ?? '',
    payload.descriptionEn ?? '',
    payload.imageUrl ?? '',
    toD1Bool(payload.isActive ?? true),
    payload.sortOrder ?? 0
  );
  return toDto(row!);
}

export async function updateProductCategory(id: string, payload: ChurchProductCategoryPayload): Promise<ChurchProductCategoryDto> {
  const current = await getProductCategory(id);

  const row = await d1FirstConflictAware<Row>(
    `UPDATE icon_product_categories SET
       slug = ?, name_uk = ?, name_ru = ?, name_en = ?, description_uk = ?, description_ru = ?,
       description_en = ?, image_url = ?, is_active = ?, sort_order = ?
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.slug?.trim() || current.slug,
    payload.nameUk?.trim() || current.nameUk,
    payload.nameRu ?? current.nameRu,
    payload.nameEn ?? current.nameEn,
    payload.descriptionUk ?? current.descriptionUk,
    payload.descriptionRu ?? current.descriptionRu,
    payload.descriptionEn ?? current.descriptionEn,
    payload.imageUrl ?? current.imageUrl,
    toD1Bool(payload.isActive ?? current.isActive),
    payload.sortOrder ?? current.sortOrder,
    id
  );
  return toDto(row!);
}

export async function deleteProductCategory(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM icon_product_categories WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('product category not found');
}
