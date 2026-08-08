import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { genId, IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID } from '../mappers';
import { slugify } from '../slug';

/** Mirrors assistant/src/interfaces/http/church_content.rs list_saints /
 * get_saint / create_saint / update_saint / delete_saint. */

type Row = {
  id: string;
  icon_id: string | null;
  calendar_day_id: string | null;
  slug: string;
  name: string;
  short_description: string;
  biography: string;
  feast_day_old_style: string;
  feast_day_new_style: string;
  image_url: string;
  language: string;
  translation_group_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ChurchSaintDto = {
  id: string;
  siteId: string;
  iconId: string | null;
  calendarDayId: string | null;
  slug: string;
  name: string;
  shortDescription: string;
  biography: string;
  feastDayOldStyle: string;
  feastDayNewStyle: string;
  imageUrl: string;
  language: string;
  translationGroupId: string;
  status: string;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchSaintPayload = Partial<{
  iconId: string | null;
  calendarDayId: string | null;
  slug: string;
  name: string;
  shortDescription: string;
  biography: string;
  feastDayOldStyle: string;
  feastDayNewStyle: string;
  imageUrl: string;
  language: string;
  status: string;
  isGlobal: boolean;
}>;

function toDto(row: Row): ChurchSaintDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    iconId: row.icon_id,
    calendarDayId: row.calendar_day_id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    biography: row.biography,
    feastDayOldStyle: row.feast_day_old_style,
    feastDayNewStyle: row.feast_day_new_style,
    imageUrl: row.image_url,
    language: row.language,
    translationGroupId: row.translation_group_id,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, icon_id, calendar_day_id, slug, name, short_description, biography, feast_day_old_style, feast_day_new_style, image_url, language, translation_group_id, status, created_at, updated_at';

export async function listSaints(params: { calendarDayId?: string; iconId?: string; language?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_saints
     WHERE (?1 IS NULL OR calendar_day_id = ?1)
       AND (?2 IS NULL OR icon_id = ?2)
       AND (?3 IS NULL OR language = ?3)
     ORDER BY name ASC, updated_at DESC`,
    params.calendarDayId ?? null,
    params.iconId ?? null,
    params.language ?? null
  );
  return rows.map(toDto);
}

export async function getSaint(id: string): Promise<ChurchSaintDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_saints WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('saint not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createSaint(payload: ChurchSaintPayload): Promise<ChurchSaintDto> {
  const name = required(payload.name, 'name');
  const slug = payload.slug?.trim() || slugify(name, 'saint');
  const fallbackGroupId = genId();

  const row = await d1First<Row>(
    `INSERT INTO church_saints
       (icon_id, calendar_day_id, slug, name, short_description, biography, feast_day_old_style, feast_day_new_style, image_url, language, status,
        translation_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT translation_group_id FROM church_saints WHERE slug = ? LIMIT 1), ?))
     RETURNING ${COLUMNS}`,
    payload.iconId ?? null,
    payload.calendarDayId ?? null,
    slug,
    name,
    payload.shortDescription ?? '',
    payload.biography ?? '',
    payload.feastDayOldStyle ?? '',
    payload.feastDayNewStyle ?? '',
    payload.imageUrl ?? '',
    payload.language ?? 'uk',
    payload.status ?? 'draft',
    slug,
    fallbackGroupId
  );
  return toDto(row!);
}

export async function updateSaint(id: string, payload: ChurchSaintPayload): Promise<ChurchSaintDto> {
  const current = await getSaint(id);
  const slug = payload.slug?.trim() || current.slug;

  const row = await d1First<Row>(
    `UPDATE church_saints SET
       icon_id = ?, calendar_day_id = ?, slug = ?, name = ?, short_description = ?, biography = ?,
       feast_day_old_style = ?, feast_day_new_style = ?, image_url = ?, language = ?, status = ?,
       translation_group_id = COALESCE(
         (SELECT other.translation_group_id FROM church_saints other WHERE other.slug = ? AND other.id != ? LIMIT 1),
         (SELECT translation_group_id FROM church_saints WHERE id = ?)
       )
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.iconId !== undefined ? payload.iconId : current.iconId,
    payload.calendarDayId !== undefined ? payload.calendarDayId : current.calendarDayId,
    slug,
    payload.name?.trim() || current.name,
    payload.shortDescription ?? current.shortDescription,
    payload.biography ?? current.biography,
    payload.feastDayOldStyle ?? current.feastDayOldStyle,
    payload.feastDayNewStyle ?? current.feastDayNewStyle,
    payload.imageUrl ?? current.imageUrl,
    payload.language ?? current.language,
    payload.status ?? current.status,
    slug,
    id,
    id,
    id
  );
  return toDto(row!);
}

export async function deleteSaint(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_saints WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('saint not found');
}
