import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { genId, IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID, toD1Bool } from '../mappers';

/** Mirrors assistant/src/interfaces/http/church_content.rs
 * list_icons / get_icon (get_icon_row) / create_icon / update_icon /
 * delete_icon, minus site_id/is_global filtering. */

type Row = {
  id: string;
  calendar_day_id: string | null;
  title: string;
  slug: string;
  image_url: string;
  saint_name: string;
  feast_name: string;
  description: string;
  language: string;
  translation_group_id: string;
  status: string;
  order_enabled: number;
  order_block_text: string;
  production_time: string;
  price_cents: number | null;
  currency: string;
  consecration_available: number;
  created_at: string;
  updated_at: string;
};

export type ChurchIconDto = {
  id: string;
  siteId: string;
  calendarDayId: string | null;
  title: string;
  slug: string;
  imageUrl: string;
  saintName: string;
  feastName: string;
  description: string;
  language: string;
  translationGroupId: string;
  status: string;
  isGlobal: boolean;
  orderEnabled: boolean;
  orderBlockText: string;
  productionTime: string;
  priceCents: number | null;
  currency: string;
  consecrationAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchIconPayload = Partial<{
  calendarDayId: string | null;
  title: string;
  slug: string;
  imageUrl: string;
  saintName: string;
  feastName: string;
  description: string;
  language: string;
  status: string;
  isGlobal: boolean;
  orderEnabled: boolean;
  orderBlockText: string;
  productionTime: string;
  priceCents: number | null;
  currency: string;
  consecrationAvailable: boolean;
}>;

function toDto(row: Row): ChurchIconDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    calendarDayId: row.calendar_day_id,
    title: row.title,
    slug: row.slug,
    imageUrl: row.image_url,
    saintName: row.saint_name,
    feastName: row.feast_name,
    description: row.description,
    language: row.language,
    translationGroupId: row.translation_group_id,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    orderEnabled: toD1BoolRead(row.order_enabled),
    orderBlockText: row.order_block_text,
    productionTime: row.production_time,
    priceCents: row.price_cents,
    currency: row.currency,
    consecrationAvailable: toD1BoolRead(row.consecration_available),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// local alias kept distinct from mappers' fromD1Bool name to make the
// read-direction obvious at each call site above.
function toD1BoolRead(value: number): boolean {
  return value === 1;
}

const COLUMNS =
  'id, calendar_day_id, title, slug, image_url, saint_name, feast_name, description, language, translation_group_id, status, order_enabled, order_block_text, production_time, price_cents, currency, consecration_available, created_at, updated_at';

export async function listIcons(params: { calendarDayId?: string; language?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_icons
     WHERE (?1 IS NULL OR calendar_day_id = ?1)
       AND (?2 IS NULL OR language = ?2)
     ORDER BY updated_at DESC`,
    params.calendarDayId ?? null,
    params.language ?? null
  );
  return rows.map(toDto);
}

export async function getIcon(id: string): Promise<ChurchIconDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_icons WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('icon not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createIcon(payload: ChurchIconPayload): Promise<ChurchIconDto> {
  const title = required(payload.title, 'title');
  const slug = required(payload.slug, 'slug');
  const fallbackGroupId = genId();

  const row = await d1First<Row>(
    `INSERT INTO church_icons
       (calendar_day_id, title, slug, image_url, saint_name, feast_name, description, language,
        status, order_enabled, order_block_text, production_time, price_cents, currency, consecration_available,
        translation_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT translation_group_id FROM church_icons WHERE slug = ? LIMIT 1), ?))
     RETURNING ${COLUMNS}`,
    payload.calendarDayId ?? null,
    title,
    slug,
    payload.imageUrl ?? '',
    payload.saintName ?? '',
    payload.feastName ?? '',
    payload.description ?? '',
    payload.language ?? 'uk',
    payload.status ?? 'draft',
    toD1Bool(payload.orderEnabled),
    payload.orderBlockText ?? '',
    payload.productionTime ?? '',
    payload.priceCents ?? null,
    payload.currency ?? 'UAH',
    toD1Bool(payload.consecrationAvailable),
    slug,
    fallbackGroupId
  );
  return toDto(row!);
}

export async function updateIcon(id: string, payload: ChurchIconPayload): Promise<ChurchIconDto> {
  const current = await getIcon(id);
  const slug = payload.slug?.trim() || current.slug;

  const row = await d1First<Row>(
    `UPDATE church_icons SET
       calendar_day_id = ?, title = ?, slug = ?, image_url = ?, saint_name = ?, feast_name = ?,
       description = ?, language = ?, status = ?, order_enabled = ?, order_block_text = ?,
       production_time = ?, price_cents = ?, currency = ?, consecration_available = ?,
       translation_group_id = COALESCE(
         (SELECT other.translation_group_id FROM church_icons other WHERE other.slug = ? AND other.id != ? LIMIT 1),
         (SELECT translation_group_id FROM church_icons WHERE id = ?)
       )
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.calendarDayId !== undefined ? payload.calendarDayId : current.calendarDayId,
    payload.title?.trim() || current.title,
    slug,
    payload.imageUrl ?? current.imageUrl,
    payload.saintName ?? current.saintName,
    payload.feastName ?? current.feastName,
    payload.description ?? current.description,
    payload.language ?? current.language,
    payload.status ?? current.status,
    toD1Bool(payload.orderEnabled ?? current.orderEnabled),
    payload.orderBlockText ?? current.orderBlockText,
    payload.productionTime ?? current.productionTime,
    payload.priceCents !== undefined ? payload.priceCents : current.priceCents,
    payload.currency ?? current.currency,
    toD1Bool(payload.consecrationAvailable ?? current.consecrationAvailable),
    slug,
    id,
    id,
    id
  );
  return toDto(row!);
}

export async function deleteIcon(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_icons WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('icon not found');
}
