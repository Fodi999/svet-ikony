import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID } from '../mappers';

/** Mirrors assistant/src/interfaces/http/church_content.rs list_articles /
 * get_article / create_article / update_article / delete_article. Unlike
 * saints/gospel/prayers, articles require an explicit slug — no
 * slugify()-from-title fallback in the Rust handler, so none here either. */

type Row = {
  id: string;
  icon_id: string | null;
  calendar_day_id: string | null;
  title: string;
  slug: string;
  content: string;
  language: string;
  seo_title: string;
  seo_description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ChurchArticleDto = {
  id: string;
  siteId: string;
  iconId: string | null;
  calendarDayId: string | null;
  title: string;
  slug: string;
  content: string;
  language: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchArticlePayload = Partial<{
  iconId: string | null;
  calendarDayId: string | null;
  title: string;
  slug: string;
  content: string;
  language: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  isGlobal: boolean;
}>;

function toDto(row: Row): ChurchArticleDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    iconId: row.icon_id,
    calendarDayId: row.calendar_day_id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    language: row.language,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, icon_id, calendar_day_id, title, slug, content, language, seo_title, seo_description, status, created_at, updated_at';

export async function listArticles(params: { calendarDayId?: string; iconId?: string; language?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_articles
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

export async function getArticle(id: string): Promise<ChurchArticleDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_articles WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('article not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createArticle(payload: ChurchArticlePayload): Promise<ChurchArticleDto> {
  const title = required(payload.title, 'title');
  const slug = required(payload.slug, 'slug');

  const row = await d1First<Row>(
    `INSERT INTO church_articles (icon_id, calendar_day_id, title, slug, content, language, seo_title, seo_description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    payload.iconId ?? null,
    payload.calendarDayId ?? null,
    title,
    slug,
    payload.content ?? '',
    payload.language ?? 'uk',
    payload.seoTitle ?? '',
    payload.seoDescription ?? '',
    payload.status ?? 'draft'
  );
  return toDto(row!);
}

export async function updateArticle(id: string, payload: ChurchArticlePayload): Promise<ChurchArticleDto> {
  const current = await getArticle(id);
  const row = await d1First<Row>(
    `UPDATE church_articles SET
       icon_id = ?, calendar_day_id = ?, title = ?, slug = ?, content = ?, language = ?,
       seo_title = ?, seo_description = ?, status = ?
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.iconId !== undefined ? payload.iconId : current.iconId,
    payload.calendarDayId !== undefined ? payload.calendarDayId : current.calendarDayId,
    payload.title?.trim() || current.title,
    payload.slug?.trim() || current.slug,
    payload.content ?? current.content,
    payload.language ?? current.language,
    payload.seoTitle ?? current.seoTitle,
    payload.seoDescription ?? current.seoDescription,
    payload.status ?? current.status,
    id
  );
  return toDto(row!);
}

export async function deleteArticle(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_articles WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('article not found');
}
