import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID } from '../mappers';

/** Mirrors assistant/src/interfaces/http/church_content.rs
 * list_calendar_days / get_calendar_day / create_calendar_day /
 * update_calendar_day / delete_calendar_day, minus the site_id/is_global
 * filtering this D1 database no longer needs (single-tenant). */

type Row = {
  id: string;
  date_old_style: string | null;
  date_new_style: string | null;
  calendar_type: string;
  title: string;
  day_type: string;
  description: string;
  rank: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ChurchCalendarDayDto = {
  id: string;
  siteId: string;
  dateOldStyle: string | null;
  dateNewStyle: string | null;
  calendarType: string;
  title: string;
  dayType: string;
  description: string;
  rank: number;
  status: string;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchCalendarDayPayload = Partial<{
  dateOldStyle: string | null;
  dateNewStyle: string | null;
  calendarType: string;
  title: string;
  dayType: string;
  description: string;
  rank: number;
  status: string;
  isGlobal: boolean;
}>;

function toDto(row: Row): ChurchCalendarDayDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    dateOldStyle: row.date_old_style,
    dateNewStyle: row.date_new_style,
    calendarType: row.calendar_type,
    title: row.title,
    dayType: row.day_type,
    description: row.description,
    rank: row.rank,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'id, date_old_style, date_new_style, calendar_type, title, day_type, description, rank, status, created_at, updated_at';

function filterByYearMonth(rows: ChurchCalendarDayDto[], year?: number, month?: number) {
  if (!year && !month) return rows;
  return rows.filter((row) => {
    const dateText = row.dateNewStyle || row.dateOldStyle;
    if (!dateText) return true;
    const parsed = new Date(`${dateText}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return true;
    if (year && parsed.getUTCFullYear() !== year) return false;
    if (month && parsed.getUTCMonth() + 1 !== month) return false;
    return true;
  });
}

export async function listCalendarDays(params: { year?: number; month?: number } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_calendar_days ORDER BY COALESCE(date_new_style, date_old_style), rank DESC, title ASC`
  );
  return filterByYearMonth(rows.map(toDto), params.year, params.month);
}

export async function getCalendarDay(id: string): Promise<ChurchCalendarDayDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_calendar_days WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('calendar day not found');
  return toDto(row);
}

function requiredTitle(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation('title is required');
  return trimmed;
}

export async function createCalendarDay(payload: ChurchCalendarDayPayload): Promise<ChurchCalendarDayDto> {
  const title = requiredTitle(payload.title);
  if (!payload.dateOldStyle && !payload.dateNewStyle) {
    throw ApiError.validation('dateOldStyle or dateNewStyle is required');
  }
  const row = await d1First<Row>(
    `INSERT INTO church_calendar_days
       (date_old_style, date_new_style, calendar_type, title, day_type, description, rank, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    payload.dateOldStyle ?? null,
    payload.dateNewStyle ?? null,
    payload.calendarType ?? 'both',
    title,
    payload.dayType ?? 'saint',
    payload.description ?? '',
    payload.rank ?? 0,
    payload.status ?? 'draft'
  );
  return toDto(row!);
}

export async function updateCalendarDay(id: string, payload: ChurchCalendarDayPayload): Promise<ChurchCalendarDayDto> {
  const current = await getCalendarDay(id);
  const row = await d1First<Row>(
    `UPDATE church_calendar_days SET
       date_old_style = ?, date_new_style = ?, calendar_type = ?, title = ?,
       day_type = ?, description = ?, rank = ?, status = ?
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.dateOldStyle !== undefined ? payload.dateOldStyle : current.dateOldStyle,
    payload.dateNewStyle !== undefined ? payload.dateNewStyle : current.dateNewStyle,
    payload.calendarType ?? current.calendarType,
    payload.title?.trim() || current.title,
    payload.dayType ?? current.dayType,
    payload.description ?? current.description,
    payload.rank ?? current.rank,
    payload.status ?? current.status,
    id
  );
  return toDto(row!);
}

export async function deleteCalendarDay(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_calendar_days WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('calendar day not found');
}
