import type { MediaKind } from './types';

/**
 * Which (module, purpose) pairs are allowed to appear in an R2 key, and
 * which media kind each purpose is. Traced directly to real D1 columns
 * found during the Stage 2D media audit (church_alphabet_letters.card_image_url/
 * main_image_url, church_prayers.image_url/audio_url, church_saints.image_url,
 * church_icons.image_url, church_info.gallery_images, icon_product_categories.image_url,
 * icon_order_options.photo_url/gallery_urls) plus church_articles, which has
 * no image column yet but was explicitly named as a target module for this
 * stage's key-structure examples — kept here as a purpose the key validator
 * accepts, even though no admin form writes it yet.
 *
 * Adding a module/purpose here does NOT create any upload UI or wire any
 * form — it only changes what generateMediaKey()/validateMediaKey() accept.
 */
export const ALLOWED_MODULE_PURPOSES: Record<string, readonly string[]> = {
  alphabet: ['card', 'main', 'audio'],
  prayers: ['image', 'audio'],
  saints: ['main'],
  articles: ['cover'],
  icons: ['main'],
  calendar: ['main'], // church_calendar_days.imageId — admin's Calendar Day "Медіа" tab
  church: ['gallery'],
  categories: ['main'],
  products: ['photo', 'gallery'],
  telegram: ['post-image', 'post-audio'], // telegram_posts.media_url/audio_url, picked via the Content Plan media picker
  visualizer: ['model'], // visualizer_models.r2_key (GLB 3D models) — Візуалізатор feature
};

export type AllowedModule = keyof typeof ALLOWED_MODULE_PURPOSES;

/** Which media kind (image vs audio) each purpose implies, independent of
 * module — every purpose above is either always-image or always-audio.
 * 'post-audio' (Telegram Content Plan's audio purpose) belongs here too --
 * missing it here made mediaKindForPurpose() silently fall through to
 * 'image' for every Telegram audio upload, so the upload route validated
 * the file against IMAGE_MIME_EXTENSIONS/MAX_IMAGE_BYTES instead of the
 * audio ones, rejecting every real audio file (even a plain MP3) with 415
 * UNSUPPORTED_MEDIA_TYPE. */
const AUDIO_PURPOSES = new Set(['audio', 'post-audio']);
const MODEL_PURPOSES = new Set(['model']);

export function mediaKindForPurpose(purpose: string): MediaKind {
  if (MODEL_PURPOSES.has(purpose)) return 'model';
  return AUDIO_PURPOSES.has(purpose) ? 'audio' : 'image';
}

/** MIME -> file extension. Only formats the project actually has evidence
 * of using: audio/mpeg, audio/mp4, audio/ogg are pre-approved by the Stage
 * 2D brief itself; audio/wav and image/avif are excluded — no existing
 * component, mock data, or dependency in either repo references either
 * format (checked via grep before writing this). */
export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

/** GLB uploads (Візуалізатор). `model/gltf-binary` is the correct MIME, but
 * browsers/OS file pickers frequently report `.glb` selections as the
 * generic `application/octet-stream` (or leave it empty) since it isn't a
 * universally-sniffed type — accepting both here is scoped safely: this
 * mapping only ever takes effect for the `model` purpose, which only the
 * `visualizer` module allows (see mediaKindForPurpose/ALLOWED_MODULE_PURPOSES
 * above and the upload route's own kind-gated MIME check), and the upload
 * route additionally requires the filename to end in `.glb` whenever the
 * reported MIME is the generic octet-stream one. */
export const MODEL_MIME_EXTENSIONS: Record<string, string> = {
  'model/gltf-binary': 'glb',
  'application/octet-stream': 'glb',
};

export const ALL_MIME_EXTENSIONS: Record<string, string> = {
  ...IMAGE_MIME_EXTENSIONS,
  ...AUDIO_MIME_EXTENSIONS,
  ...MODEL_MIME_EXTENSIONS,
};

/**
 * Starting limits. No sample content photos/audio exist in either repo to
 * benchmark against (checked public/ in both projects — only a handful of
 * PWA icons under 40KB each, nothing representative of real uploaded
 * content) — kept at the Stage 2D brief's own proposed values pending real
 * data. Revisit once real admin uploads or the Stage 2E migration audit
 * produce actual file sizes.
 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
/** GLB models are typically much larger than a photo or audio clip. One
 * named constant, per the MVP brief, so it's trivial to change later. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

export function maxBytesForKind(kind: MediaKind): number {
  if (kind === 'model') return MAX_MODEL_BYTES;
  return kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}
