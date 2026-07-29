import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID } from '../mappers';
import { slugify } from '../slug';

/** Mirrors assistant/src/interfaces/http/church_content.rs list_gospel /
 * get_gospel / create_gospel / update_gospel / delete_gospel. */

type Row = {
  id: string;
  icon_id: string | null;
  calendar_day_id: string | null;
  slug: string;
  title: string;
  reference: string;
  text: string;
  explanation: string;
  language: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ChurchGospelDto = {
  id: string;
  siteId: string;
  iconId: string | null;
  calendarDayId: string | null;
  slug: string;
  title: string;
  reference: string;
  text: string;
  explanation: string;
  language: string;
  status: string;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchGospelPayload = Partial<{
  iconId: string | null;
  calendarDayId: string | null;
  slug: string;
  title: string;
  reference: string;
  text: string;
  explanation: string;
  language: string;
  status: string;
  isGlobal: boolean;
}>;

function toDto(row: Row): ChurchGospelDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    iconId: row.icon_id,
    calendarDayId: row.calendar_day_id,
    slug: row.slug,
    title: row.title,
    reference: row.reference,
    text: row.text,
    explanation: row.explanation,
    language: row.language,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, icon_id, calendar_day_id, slug, title, reference, text, explanation, language, status, created_at, updated_at';

export async function listGospel(params: { calendarDayId?: string; iconId?: string; language?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_gospel_readings
     WHERE (?1 IS NULL OR calendar_day_id = ?1)
       AND (?2 IS NULL OR icon_id = ?2)
       AND (?3 IS NULL OR language = ?3)
     ORDER BY updated_at DESC`,
    params.calendarDayId ?? null,
    params.iconId ?? null,
    params.language ?? null
  );
  return rows.map(toDto);
}

export async function getGospel(id: string): Promise<ChurchGospelDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_gospel_readings WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('gospel reading not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createGospel(payload: ChurchGospelPayload): Promise<ChurchGospelDto> {
  const title = required(payload.title, 'title');
  const slug = payload.slug?.trim() || slugify(title, 'gospel');

  const row = await d1First<Row>(
    `INSERT INTO church_gospel_readings (icon_id, calendar_day_id, slug, title, reference, text, explanation, language, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    payload.iconId ?? null,
    payload.calendarDayId ?? null,
    slug,
    title,
    payload.reference ?? '',
    payload.text ?? '',
    payload.explanation ?? '',
    payload.language ?? 'uk',
    payload.status ?? 'draft'
  );
  return toDto(row!);
}

export async function updateGospel(id: string, payload: ChurchGospelPayload): Promise<ChurchGospelDto> {
  const current = await getGospel(id);
  const row = await d1First<Row>(
    `UPDATE church_gospel_readings SET
       icon_id = ?, calendar_day_id = ?, slug = ?, title = ?, reference = ?, text = ?, explanation = ?,
       language = ?, status = ?
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.iconId !== undefined ? payload.iconId : current.iconId,
    payload.calendarDayId !== undefined ? payload.calendarDayId : current.calendarDayId,
    payload.slug?.trim() || current.slug,
    payload.title?.trim() || current.title,
    payload.reference ?? current.reference,
    payload.text ?? current.text,
    payload.explanation ?? current.explanation,
    payload.language ?? current.language,
    payload.status ?? current.status,
    id
  );
  return toDto(row!);
}

export async function deleteGospel(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_gospel_readings WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('gospel reading not found');
}
