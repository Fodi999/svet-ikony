import { d1All, d1First, d1Run } from '../db';
import { ApiError } from '../errors';
import { fromD1Json, genId, IS_GLOBAL_DEFAULT, SVETIKONY_SITE_ID, toD1Bool, toD1Json } from '../mappers';
import { slugify } from '../slug';

/** Mirrors assistant/src/interfaces/http/church_content.rs list_prayers /
 * get_prayer / create_prayer / update_prayer / delete_prayer.
 *
 * NOT ported: `spawn_visualizer_processing_if_needed` — the Rust side fires
 * a background job (decode the source photo, sample particles, upload
 * precomputed maps to R2) whenever the effective visualizer image changes.
 * That's an image-processing pipeline, not a CRUD concern, and porting it
 * needs its own scoped effort (Workers `ctx.waitUntil()` + a from-scratch
 * port of the `image`/`flate2`-based sampling code). Rows created/updated
 * here leave `church_prayer_visualizer_assets` untouched — the visualizer
 * settings columns on church_prayers still save correctly, they just won't
 * auto-trigger asset generation the way the Rust backend does today. */

type Row = {
  id: string;
  icon_id: string | null;
  calendar_day_id: string | null;
  slug: string;
  title: string;
  text: string;
  audio_url: string;
  qr_code_url: string;
  image_url: string;
  source: string;
  source_url: string;
  note: string;
  language: string;
  prayer_type: string;
  translation_group_id: string;
  status: string;
  visualizer_enabled: number;
  visualizer_image_url: string;
  particle_count_desktop: number;
  particle_count_mobile: number;
  particle_size: number;
  particle_color_mode: string;
  background_color: string;
  audio_reactivity: number;
  scene_timeline: string;
  subtitle_cues: string;
  created_at: string;
  updated_at: string;
};

export type ChurchPrayerDto = {
  id: string;
  siteId: string;
  iconId: string | null;
  calendarDayId: string | null;
  slug: string;
  title: string;
  text: string;
  audioUrl: string;
  qrCodeUrl: string;
  imageUrl: string;
  source: string;
  sourceUrl: string;
  note: string;
  language: string;
  prayerType: string;
  translationGroupId: string;
  status: string;
  isGlobal: boolean;
  visualizerEnabled: boolean;
  visualizerImageUrl: string;
  particleCountDesktop: number;
  particleCountMobile: number;
  particleSize: number;
  particleColorMode: string;
  backgroundColor: string;
  audioReactivity: number;
  sceneTimeline: unknown;
  subtitleCues: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ChurchPrayerPayload = Partial<{
  iconId: string | null;
  calendarDayId: string | null;
  slug: string;
  title: string;
  text: string;
  audioUrl: string;
  qrCodeUrl: string;
  imageUrl: string;
  source: string;
  sourceUrl: string;
  note: string;
  language: string;
  prayerType: string;
  status: string;
  isGlobal: boolean;
  visualizerEnabled: boolean;
  visualizerImageUrl: string;
  particleCountDesktop: number;
  particleCountMobile: number;
  particleSize: number;
  particleColorMode: string;
  backgroundColor: string;
  audioReactivity: number;
  sceneTimeline: unknown;
  subtitleCues: unknown;
}>;

const DEFAULT_SCENE_TIMELINE = { idle: 2000, assemble: 2500, reveal: 1500, dissolve: 2000 };

function toDto(row: Row): ChurchPrayerDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    iconId: row.icon_id,
    calendarDayId: row.calendar_day_id,
    slug: row.slug,
    title: row.title,
    text: row.text,
    audioUrl: row.audio_url,
    qrCodeUrl: row.qr_code_url,
    imageUrl: row.image_url,
    source: row.source,
    sourceUrl: row.source_url,
    note: row.note,
    language: row.language,
    prayerType: row.prayer_type,
    translationGroupId: row.translation_group_id,
    status: row.status,
    isGlobal: IS_GLOBAL_DEFAULT,
    visualizerEnabled: row.visualizer_enabled === 1,
    visualizerImageUrl: row.visualizer_image_url,
    particleCountDesktop: row.particle_count_desktop,
    particleCountMobile: row.particle_count_mobile,
    particleSize: row.particle_size,
    particleColorMode: row.particle_color_mode,
    backgroundColor: row.background_color,
    audioReactivity: row.audio_reactivity,
    sceneTimeline: fromD1Json(row.scene_timeline, DEFAULT_SCENE_TIMELINE),
    subtitleCues: fromD1Json(row.subtitle_cues, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  'id, icon_id, calendar_day_id, slug, title, text, audio_url, qr_code_url, image_url, source, source_url, note, language, prayer_type, translation_group_id, status, visualizer_enabled, visualizer_image_url, particle_count_desktop, particle_count_mobile, particle_size, particle_color_mode, background_color, audio_reactivity, scene_timeline, subtitle_cues, created_at, updated_at';

export async function listPrayers(params: { calendarDayId?: string; iconId?: string; language?: string } = {}) {
  const rows = await d1All<Row>(
    `SELECT ${COLUMNS} FROM church_prayers
     WHERE (?1 IS NULL OR calendar_day_id = ?1)
       AND (?2 IS NULL OR icon_id = ?2)
       AND (?3 IS NULL OR language = ?3)
     ORDER BY prayer_type ASC, updated_at DESC`,
    params.calendarDayId ?? null,
    params.iconId ?? null,
    params.language ?? null
  );
  return rows.map(toDto);
}

export async function getPrayer(id: string): Promise<ChurchPrayerDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_prayers WHERE id = ?`, id);
  if (!row) throw ApiError.notFound('prayer not found');
  return toDto(row);
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`${field} is required`);
  return trimmed;
}

export async function createPrayer(payload: ChurchPrayerPayload): Promise<ChurchPrayerDto> {
  const title = required(payload.title, 'title');
  const slug = payload.slug?.trim() || slugify(title, 'prayer');
  const fallbackGroupId = genId();

  const row = await d1First<Row>(
    `INSERT INTO church_prayers
       (icon_id, calendar_day_id, slug, title, text, audio_url, qr_code_url, image_url, source, source_url, note,
        language, prayer_type, status, translation_group_id,
        visualizer_enabled, visualizer_image_url, particle_count_desktop, particle_count_mobile, particle_size,
        particle_color_mode, background_color, audio_reactivity, scene_timeline, subtitle_cues)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT translation_group_id FROM church_prayers WHERE slug = ? LIMIT 1), ?),
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    payload.iconId ?? null,
    payload.calendarDayId ?? null,
    slug,
    title,
    payload.text ?? '',
    payload.audioUrl ?? '',
    payload.qrCodeUrl ?? '',
    payload.imageUrl ?? '',
    payload.source ?? '',
    payload.sourceUrl ?? '',
    payload.note ?? '',
    payload.language ?? 'uk',
    payload.prayerType ?? 'prayer',
    payload.status ?? 'draft',
    slug,
    fallbackGroupId,
    toD1Bool(payload.visualizerEnabled),
    payload.visualizerImageUrl ?? '',
    payload.particleCountDesktop ?? 50000,
    payload.particleCountMobile ?? 16000,
    payload.particleSize ?? 2.0,
    payload.particleColorMode ?? 'silver_gold',
    payload.backgroundColor ?? '#000000',
    payload.audioReactivity ?? 0.5,
    toD1Json(payload.sceneTimeline ?? DEFAULT_SCENE_TIMELINE),
    toD1Json(payload.subtitleCues ?? [])
  );
  return toDto(row!);
}

export async function updatePrayer(id: string, payload: ChurchPrayerPayload): Promise<ChurchPrayerDto> {
  const current = await getPrayer(id);
  const slug = payload.slug?.trim() || current.slug;

  const row = await d1First<Row>(
    `UPDATE church_prayers SET
       icon_id = ?, calendar_day_id = ?, slug = ?, title = ?, text = ?, audio_url = ?, qr_code_url = ?,
       image_url = ?, source = ?, source_url = ?, note = ?, language = ?, prayer_type = ?, status = ?,
       visualizer_enabled = ?, visualizer_image_url = ?, particle_count_desktop = ?, particle_count_mobile = ?,
       particle_size = ?, particle_color_mode = ?, background_color = ?, audio_reactivity = ?,
       scene_timeline = ?, subtitle_cues = ?,
       translation_group_id = COALESCE(
         (SELECT other.translation_group_id FROM church_prayers other WHERE other.slug = ? AND other.id != ? LIMIT 1),
         (SELECT translation_group_id FROM church_prayers WHERE id = ?)
       )
     WHERE id = ?
     RETURNING ${COLUMNS}`,
    payload.iconId !== undefined ? payload.iconId : current.iconId,
    payload.calendarDayId !== undefined ? payload.calendarDayId : current.calendarDayId,
    slug,
    payload.title?.trim() || current.title,
    payload.text ?? current.text,
    payload.audioUrl ?? current.audioUrl,
    payload.qrCodeUrl ?? current.qrCodeUrl,
    payload.imageUrl ?? current.imageUrl,
    payload.source ?? current.source,
    payload.sourceUrl ?? current.sourceUrl,
    payload.note ?? current.note,
    payload.language ?? current.language,
    payload.prayerType ?? current.prayerType,
    payload.status ?? current.status,
    toD1Bool(payload.visualizerEnabled ?? current.visualizerEnabled),
    payload.visualizerImageUrl ?? current.visualizerImageUrl,
    payload.particleCountDesktop ?? current.particleCountDesktop,
    payload.particleCountMobile ?? current.particleCountMobile,
    payload.particleSize ?? current.particleSize,
    payload.particleColorMode ?? current.particleColorMode,
    payload.backgroundColor ?? current.backgroundColor,
    payload.audioReactivity ?? current.audioReactivity,
    toD1Json(payload.sceneTimeline ?? current.sceneTimeline),
    toD1Json(payload.subtitleCues ?? current.subtitleCues),
    slug,
    id,
    id,
    id
  );
  return toDto(row!);
}

export async function deletePrayer(id: string): Promise<void> {
  const result = await d1Run('DELETE FROM church_prayers WHERE id = ?', id);
  if (!result.meta.changes) throw ApiError.notFound('prayer not found');
}
