import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { fromD1Bool, genId, IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID, toD1Bool } from '../mappers';
import { slugify } from '../slug';

/** "Візуалізатор" -- admin-curated historical/biblical/church-history
 * events with flexible chronology (era/century/year/BC-AD/traditional) and
 * optional geo coordinates. Row-per-language, same shape as
 * church_saints/church_alphabet_letters -- see this file's create/update
 * for the same COALESCE-by-slug translation_group_id auto-join pattern
 * used there. */

type Row = {
  id: string;
  slug: string;
  language: string;
  translation_group_id: string;
  title: string;
  summary: string;
  description: string;
  event_type: string;
  chronology_type: string;
  era: string;
  calendar_era: string;
  year_start: number | null;
  year_end: number | null;
  century: number | null;
  display_date: string;
  sort_year: number;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  calendar_day_id: string | null;
  status: string;
  is_featured: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type ChurchVisualizerEventDto = {
  id: string;
  siteId: string;
  slug: string;
  language: string;
  translationGroupId: string;
  title: string;
  summary: string;
  description: string;
  eventType: string;
  chronologyType: string;
  era: string;
  calendarEra: string;
  yearStart: number | null;
  yearEnd: number | null;
  century: number | null;
  displayDate: string;
  sortYear: number;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  calendarDayId: string | null;
  status: string;
  isFeatured: boolean;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ChurchVisualizerEventPayload = Partial<{
  slug: string;
  language: string;
  title: string;
  summary: string;
  description: string;
  eventType: string;
  chronologyType: string;
  era: string;
  calendarEra: string;
  yearStart: number | null;
  yearEnd: number | null;
  century: number | null;
  displayDate: string;
  /** Machine sort key. Omit to let it be computed from yearStart/century/
   * calendarEra (see computeSortYear below) -- only pass this explicitly to
   * override the automatic computation. */
  sortYear: number;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  calendarDayId: string | null;
  status: string;
  isFeatured: boolean;
}>;

function toDto(row: Row): ChurchVisualizerEventDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    slug: row.slug,
    language: row.language,
    translationGroupId: row.translation_group_id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    eventType: row.event_type,
    chronologyType: row.chronology_type,
    era: row.era,
    calendarEra: row.calendar_era,
    yearStart: row.year_start,
    yearEnd: row.year_end,
    century: row.century,
    displayDate: row.display_date,
    sortYear: row.sort_year,
    locationName: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    calendarDayId: row.calendar_day_id,
    status: row.status,
    isFeatured: fromD1Bool(row.is_featured),
    isGlobal: IS_GLOBAL_DEFAULT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

const COLUMNS =
  'id, slug, language, translation_group_id, title, summary, description, event_type, chronology_type, era, calendar_era, year_start, year_end, century, display_date, sort_year, location_name, latitude, longitude, calendar_day_id, status, is_featured, created_at, updated_at, published_at';

/** Never leaves ordering NULL/ambiguous even for a "traditional"/"period"
 * event with no exact year -- falls back yearStart -> century*100 -> 0.
 * BC dates sort before AD ones (negative sign) so chronological ORDER BY
 * sort_year works across the BC/AD boundary without special-casing it at
 * every call site. */
function computeSortYearFromParts(yearStart: number | null, century: number | null, calendarEra: string): number {
  const sign = calendarEra === 'BC' ? -1 : 1;
  if (yearStart !== null) return sign * yearStart;
  if (century !== null) return sign * century * 100;
  return 0;
}

export async function listVisualizerEvents(
  params: { language?: string; status?: string; translationGroupId?: string } = {}
) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM visualizer_events
     WHERE (?1 IS NULL OR language = ?1)
       AND (?2 IS NULL OR status = ?2)
       AND (?3 IS NULL OR translation_group_id = ?3)
     ORDER BY sort_year ASC, title ASC`,
    params.language ?? null,
    params.status ?? null,
    params.translationGroupId ?? null
  );
  return rows.map(toDto);
}

export async function getVisualizerEvent(id: string): Promise<ChurchVisualizerEventDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM visualizer_events WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('visualizer event not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createVisualizerEvent(payload: ChurchVisualizerEventPayload): Promise<ChurchVisualizerEventDto> {
  const title = required(payload.title, 'title');
  const slug = payload.slug?.trim() || slugify(title, 'event');
  const fallbackGroupId = genId();

  const yearStart = payload.yearStart ?? null;
  const century = payload.century ?? null;
  const calendarEra = payload.calendarEra ?? 'unknown';
  const sortYear = payload.sortYear !== undefined ? payload.sortYear : computeSortYearFromParts(yearStart, century, calendarEra);
  const status = payload.status ?? 'draft';

  const row = await d1First<Row>(
    `INSERT INTO visualizer_events
       (slug, language, title, summary, description, event_type, chronology_type, era, calendar_era,
        year_start, year_end, century, display_date, sort_year, location_name, latitude, longitude,
        calendar_day_id, status, is_featured, published_at, translation_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        CASE WHEN ? = 'published' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,
        COALESCE((SELECT translation_group_id FROM visualizer_events WHERE slug = ? LIMIT 1), ?))
     RETURNING ${COLUMNS}`,
    slug,
    payload.language ?? 'uk',
    title,
    payload.summary ?? '',
    payload.description ?? '',
    payload.eventType ?? 'other',
    payload.chronologyType ?? 'unknown',
    payload.era ?? 'custom',
    calendarEra,
    yearStart,
    payload.yearEnd ?? null,
    century,
    payload.displayDate ?? '',
    sortYear,
    payload.locationName ?? '',
    payload.latitude ?? null,
    payload.longitude ?? null,
    payload.calendarDayId ?? null,
    status,
    toD1Bool(payload.isFeatured),
    status,
    slug,
    fallbackGroupId
  );
  return toDto(row!);
}

export async function updateVisualizerEvent(id: string, payload: ChurchVisualizerEventPayload): Promise<ChurchVisualizerEventDto> {
  const current = await getVisualizerEvent(id);
  const slug = payload.slug?.trim() || current.slug;

  const yearStart = payload.yearStart !== undefined ? payload.yearStart : current.yearStart;
  const century = payload.century !== undefined ? payload.century : current.century;
  const calendarEra = payload.calendarEra ?? current.calendarEra;
  const sortYear = payload.sortYear !== undefined ? payload.sortYear : computeSortYearFromParts(yearStart, century, calendarEra);
  const status = payload.status ?? current.status;

  const row = await d1First<Row>(
    `UPDATE visualizer_events SET
       slug = ?, language = ?, title = ?, summary = ?, description = ?, event_type = ?, chronology_type = ?,
       era = ?, calendar_era = ?, year_start = ?, year_end = ?, century = ?, display_date = ?, sort_year = ?,
       location_name = ?, latitude = ?, longitude = ?, calendar_day_id = ?, status = ?, is_featured = ?,
       published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE published_at END,
       translation_group_id = COALESCE(
         (SELECT other.translation_group_id FROM visualizer_events other WHERE other.slug = ? AND other.id != ? LIMIT 1),
         (SELECT translation_group_id FROM visualizer_events WHERE id = ?)
       )
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    slug,
    payload.language ?? current.language,
    payload.title?.trim() || current.title,
    payload.summary ?? current.summary,
    payload.description ?? current.description,
    payload.eventType ?? current.eventType,
    payload.chronologyType ?? current.chronologyType,
    payload.era ?? current.era,
    calendarEra,
    yearStart,
    payload.yearEnd !== undefined ? payload.yearEnd : current.yearEnd,
    century,
    payload.displayDate ?? current.displayDate,
    sortYear,
    payload.locationName ?? current.locationName,
    payload.latitude !== undefined ? payload.latitude : current.latitude,
    payload.longitude !== undefined ? payload.longitude : current.longitude,
    payload.calendarDayId !== undefined ? payload.calendarDayId : current.calendarDayId,
    status,
    toD1Bool(payload.isFeatured !== undefined ? payload.isFeatured : current.isFeatured),
    status,
    slug,
    id,
    id,
    id
  );
  return toDto(row!);
}

export async function deleteVisualizerEvent(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM visualizer_events WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('visualizer event not found');
}
