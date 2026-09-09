import { d1All, d1Batch, d1First, d1Prepare, d1Run } from '../db';
import { ApiError } from '../errors';
import { fromD1Bool, genId, toD1Bool } from '../mappers';

/** GLB 3D-model metadata for the "Візуалізатор" feature. The binary file
 * itself lives in R2 (see lib/media/*), this table only stores the R2 key
 * + metadata. `event_group_id` references visualizer_events
 * .translation_group_id at the APPLICATION level, not a SQL FOREIGN KEY --
 * see migrations/0019_visualizer.sql's header comment for why (that column
 * is deliberately shared by sibling rows, so it can't be an FK target). A
 * model with event_group_id = NULL is a standalone asset -- in practice,
 * today, always the Base Earth Model (is_base_earth = 1). */

type Row = {
  id: string;
  event_group_id: string | null;
  title: string;
  r2_key: string;
  filename: string;
  mime_type: string;
  file_size: number;
  is_base_earth: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChurchVisualizerModelDto = {
  id: string;
  eventGroupId: string | null;
  title: string;
  r2Key: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  isBaseEarth: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ChurchVisualizerModelPayload = Partial<{
  eventGroupId: string | null;
  title: string;
  r2Key: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  isBaseEarth: boolean;
  sortOrder: number;
}>;

function toDto(row: Row): ChurchVisualizerModelDto {
  return {
    id: row.id,
    eventGroupId: row.event_group_id,
    title: row.title,
    r2Key: row.r2_key,
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    isBaseEarth: fromD1Bool(row.is_base_earth),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'id, event_group_id, title, r2_key, filename, mime_type, file_size, is_base_earth, sort_order, created_at, updated_at';

export async function listVisualizerModels(params: { eventGroupId?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM visualizer_models
     WHERE (?1 IS NULL OR event_group_id = ?1)
     ORDER BY sort_order ASC, created_at ASC`,
    params.eventGroupId ?? null
  );
  return rows.map(toDto);
}

export async function getVisualizerModel(id: string): Promise<ChurchVisualizerModelDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM visualizer_models WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('visualizer model not found');
  return toDto(row);
}

export async function getBaseEarthModel(): Promise<ChurchVisualizerModelDto | null> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM visualizer_models WHERE is_base_earth = 1 LIMIT 1`);
  return row ? toDto(row) : null;
}

/** Application-level existence check standing in for the SQL FOREIGN KEY
 * this column deliberately doesn't have (see this file's header comment). */
async function requireEventGroupExists(eventGroupId: string): Promise<void> {
  const row = await d1First<{ found: number }>(
    'SELECT 1 as found FROM visualizer_events WHERE translation_group_id = ? LIMIT 1',
    eventGroupId
  );
  if (!row) throw ApiError.validation('eventGroupId does not match any existing visualizer event');
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createVisualizerModel(payload: ChurchVisualizerModelPayload): Promise<ChurchVisualizerModelDto> {
  const r2Key = required(payload.r2Key, 'r2Key');
  if (payload.eventGroupId) await requireEventGroupExists(payload.eventGroupId);
  const id = genId();

  const row = await d1First<Row>(
    `INSERT INTO visualizer_models
       (id, event_group_id, title, r2_key, filename, mime_type, file_size, is_base_earth, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    id,
    payload.eventGroupId ?? null,
    payload.title ?? '',
    r2Key,
    payload.filename ?? '',
    payload.mimeType ?? '',
    payload.fileSize ?? 0,
    toD1Bool(payload.isBaseEarth),
    payload.sortOrder ?? 0
  );
  return toDto(row!);
}

export async function updateVisualizerModel(id: string, payload: ChurchVisualizerModelPayload): Promise<ChurchVisualizerModelDto> {
  const current = await getVisualizerModel(id);
  if (payload.eventGroupId) await requireEventGroupExists(payload.eventGroupId);

  const row = await d1First<Row>(
    `UPDATE visualizer_models SET
       event_group_id = ?, title = ?, r2_key = ?, filename = ?, mime_type = ?, file_size = ?, sort_order = ?
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.eventGroupId !== undefined ? payload.eventGroupId : current.eventGroupId,
    payload.title ?? current.title,
    payload.r2Key ?? current.r2Key,
    payload.filename ?? current.filename,
    payload.mimeType ?? current.mimeType,
    payload.fileSize ?? current.fileSize,
    payload.sortOrder ?? current.sortOrder,
    id
  );
  return toDto(row!);
}

/** Atomically unsets the previous base-earth model (if any) before setting
 * this one -- the partial unique index (migrations/0019_visualizer.sql)
 * would reject setting a second is_base_earth=1 row while one already
 * exists, so the unset must land first, in the same batch. */
export async function setBaseEarthModel(id: string): Promise<ChurchVisualizerModelDto> {
  await getVisualizerModel(id); // 404s early if the id doesn't exist
  const statements = await Promise.all([
    d1Prepare('UPDATE visualizer_models SET is_base_earth = 0 WHERE is_base_earth = 1 AND id != ?', id),
    d1Prepare('UPDATE visualizer_models SET is_base_earth = 1 WHERE id = ?', id),
  ]);
  await d1Batch(statements);
  return getVisualizerModel(id);
}

export async function deleteVisualizerModel(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM visualizer_models WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('visualizer model not found');
}
