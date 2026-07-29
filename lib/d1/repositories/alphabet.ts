import { d1All, d1Batch, d1First, d1Prepare, d1Run } from '../db';
import { ApiError } from '../errors';
import { genId, IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID } from '../mappers';
import { slugify } from '../slug';

/** Mirrors assistant/src/interfaces/http/church_content.rs
 * list_alphabet_letters / get_alphabet_letter / create_alphabet_letter /
 * update_alphabet_letter / delete_alphabet_letter / reorder_alphabet_letters. */

type Row = {
  id: string;
  slug: string;
  letter: string;
  sort_order: number;
  name: string;
  short_description: string;
  full_text: string;
  numeric_value: number | null;
  modern_equivalent: string;
  color: string;
  card_image_url: string;
  main_image_url: string;
  seo_title: string;
  seo_description: string;
  language: string;
  translation_group_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ChurchAlphabetLetterDto = {
  id: string;
  siteId: string;
  slug: string;
  letter: string;
  sortOrder: number;
  name: string;
  shortDescription: string;
  fullText: string;
  numericValue: number | null;
  modernEquivalent: string;
  color: string;
  cardImageUrl: string;
  mainImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  language: string;
  translationGroupId: string;
  status: string;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchAlphabetLetterPayload = Partial<{
  slug: string;
  letter: string;
  sortOrder: number;
  name: string;
  shortDescription: string;
  fullText: string;
  numericValue: number | null;
  modernEquivalent: string;
  color: string;
  cardImageUrl: string;
  mainImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  language: string;
  status: string;
  isGlobal: boolean;
}>;

function toDto(row: Row): ChurchAlphabetLetterDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    slug: row.slug,
    letter: row.letter,
    sortOrder: row.sort_order,
    name: row.name,
    shortDescription: row.short_description,
    fullText: row.full_text,
    numericValue: row.numeric_value,
    modernEquivalent: row.modern_equivalent,
    color: row.color,
    cardImageUrl: row.card_image_url,
    mainImageUrl: row.main_image_url,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    language: row.language,
    translationGroupId: row.translation_group_id,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, slug, letter, sort_order, name, short_description, full_text, numeric_value, modern_equivalent, color, card_image_url, main_image_url, seo_title, seo_description, language, translation_group_id, status, created_at, updated_at';

export async function listAlphabetLetters(params: { language?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_alphabet_letters
     WHERE (?1 IS NULL OR language = ?1)
     ORDER BY sort_order ASC, language ASC`,
    params.language ?? null
  );
  return rows.map(toDto);
}

export async function getAlphabetLetter(id: string): Promise<ChurchAlphabetLetterDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_alphabet_letters WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('alphabet letter not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createAlphabetLetter(payload: ChurchAlphabetLetterPayload): Promise<ChurchAlphabetLetterDto> {
  const name = required(payload.name, 'name');
  const letter = required(payload.letter, 'letter');
  const slug = payload.slug?.trim() || slugify(name, 'letter');
  const fallbackGroupId = genId();

  const row = await d1First<Row>(
    `INSERT INTO church_alphabet_letters
       (slug, letter, sort_order, name, short_description, full_text, numeric_value, modern_equivalent, color,
        card_image_url, main_image_url, seo_title, seo_description, language, status, translation_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT translation_group_id FROM church_alphabet_letters WHERE slug = ? LIMIT 1), ?))
     RETURNING ${COLUMNS}`,
    slug,
    letter,
    payload.sortOrder ?? 0,
    name,
    payload.shortDescription ?? '',
    payload.fullText ?? '',
    payload.numericValue ?? null,
    payload.modernEquivalent ?? '',
    payload.color ?? '',
    payload.cardImageUrl ?? '',
    payload.mainImageUrl ?? '',
    payload.seoTitle ?? '',
    payload.seoDescription ?? '',
    payload.language ?? 'uk',
    payload.status ?? 'draft',
    slug,
    fallbackGroupId
  );
  return toDto(row!);
}

export async function updateAlphabetLetter(id: string, payload: ChurchAlphabetLetterPayload): Promise<ChurchAlphabetLetterDto> {
  const current = await getAlphabetLetter(id);
  const slug = payload.slug?.trim() || current.slug;

  const row = await d1First<Row>(
    `UPDATE church_alphabet_letters SET
       slug = ?, letter = ?, sort_order = ?, name = ?, short_description = ?, full_text = ?, numeric_value = ?,
       modern_equivalent = ?, color = ?, card_image_url = ?, main_image_url = ?, seo_title = ?, seo_description = ?,
       language = ?, status = ?,
       translation_group_id = COALESCE(
         (SELECT other.translation_group_id FROM church_alphabet_letters other WHERE other.slug = ? AND other.id != ? LIMIT 1),
         (SELECT translation_group_id FROM church_alphabet_letters WHERE id = ?)
       )
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    slug,
    payload.letter?.trim() || current.letter,
    payload.sortOrder ?? current.sortOrder,
    payload.name?.trim() || current.name,
    payload.shortDescription ?? current.shortDescription,
    payload.fullText ?? current.fullText,
    payload.numericValue !== undefined ? payload.numericValue : current.numericValue,
    payload.modernEquivalent ?? current.modernEquivalent,
    payload.color ?? current.color,
    payload.cardImageUrl ?? current.cardImageUrl,
    payload.mainImageUrl ?? current.mainImageUrl,
    payload.seoTitle ?? current.seoTitle,
    payload.seoDescription ?? current.seoDescription,
    payload.language ?? current.language,
    payload.status ?? current.status,
    slug,
    id,
    id,
    id
  );
  return toDto(row!);
}

export async function deleteAlphabetLetter(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_alphabet_letters WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('alphabet letter not found');
}

/** Rust does this as a plain sequential loop of UPDATEs with no transaction
 * wrapper — using d1Batch here is a strict improvement (atomic instead of
 * not), not a behavior change, since every statement's parameters are
 * already fully known upfront (index, groupId), which is exactly the
 * condition batch() requires. */
export async function reorderAlphabetLetters(orderedGroupIds: string[]): Promise<void> {
  const statements = await Promise.all(
    orderedGroupIds.map((groupId, index) =>
      d1Prepare('UPDATE church_alphabet_letters SET sort_order = ? WHERE translation_group_id = ?', index + 1, groupId)
    )
  );
  if (statements.length) await d1Batch(statements);
}
