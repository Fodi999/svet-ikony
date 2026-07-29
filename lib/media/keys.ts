import { ALL_MIME_EXTENSIONS, ALLOWED_MODULE_PURPOSES, type AllowedModule } from './constants';

/** Module/entityId/purpose are opaque path segments, not free text — no
 * dots (blocks `..`), no slashes/backslashes, no spaces, no Cyrillic, no
 * leading `/` (blocks absolute paths). Deliberately the same pattern for
 * all three since none of them should ever carry personal data or
 * arbitrary text, only short machine-generated identifiers. */
const SAFE_SEGMENT = /^[a-zA-Z0-9_-]{1,128}$/;

const KEY_SHAPE =
  /^media\/([a-zA-Z0-9_-]{1,128})\/([a-zA-Z0-9_-]{1,128})\/([a-zA-Z0-9_-]{1,128})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z0-9]{1,8})$/;

export function isAllowedModule(module: string): module is AllowedModule {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MODULE_PURPOSES, module);
}

export function isAllowedPurpose(module: string, purpose: string): boolean {
  return isAllowedModule(module) && (ALLOWED_MODULE_PURPOSES[module] as readonly string[]).includes(purpose);
}

export function isSafeEntityId(entityId: string): boolean {
  return SAFE_SEGMENT.test(entityId);
}

export interface MediaKeyInput {
  module: string;
  entityId: string;
  purpose: string;
  mimeType: string;
}

/**
 * `media/{module}/{entityId}/{purpose}/{uuid}.{extension}` — the extension
 * always comes from a verified MIME lookup (ALL_MIME_EXTENSIONS), never
 * from the client-supplied filename, and the filename itself never appears
 * in the key at all (only a freshly generated UUID) — see Step 4's "не
 * использовать исходное имя файла как единственный key" / "использовать
 * UUID" / "не допускать случайного перезаписывания".
 *
 * Throws on any invalid input rather than silently substituting a default —
 * callers (the upload route) are expected to have already validated module/
 * purpose/entityId/mimeType against the same rules and turn a thrown error
 * into a 400, not call this speculatively.
 */
export function generateMediaKey(input: MediaKeyInput): string {
  const { module, entityId, purpose, mimeType } = input;
  if (!isAllowedModule(module)) throw new Error(`Unknown media module: ${module}`);
  if (!isAllowedPurpose(module, purpose)) throw new Error(`Purpose "${purpose}" is not allowed for module "${module}"`);
  if (!isSafeEntityId(entityId)) throw new Error(`Unsafe entityId: ${entityId}`);
  const extension = ALL_MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error(`Unsupported MIME type: ${mimeType}`);

  const uuid = crypto.randomUUID();
  return `media/${module}/${entityId}/${purpose}/${uuid}.${extension}`;
}

/**
 * Full structural + allowlist validation of an R2 key — used before every
 * GET/DELETE touches R2, not just at upload time. Rejects anything that
 * doesn't match the exact generated shape (so `..`, backslashes, absolute
 * paths, and made-up module/purpose values are all rejected by construction
 * — the regex alone can't produce a match for any of those).
 */
export function validateMediaKey(key: string): boolean {
  if (key.includes('..') || key.includes('\\')) return false;
  const match = KEY_SHAPE.exec(key);
  if (!match) return false;
  const [, module, , purpose, , extension] = match;
  if (!isAllowedPurpose(module, purpose)) return false;
  if (!Object.values(ALL_MIME_EXTENSIONS).includes(extension)) return false;
  return true;
}

/**
 * Reconstructs the R2 key from a `GET /media/*` route's catch-all params.
 * Next.js's file-based routing (app/media/[...key]/route.ts) already
 * consumes the literal `/media` path segment before `params.key` is
 * populated, so `params.key` never contains it — this function adds it
 * back exactly once. Do not call this on anything already containing a
 * leading `media/`, and do not prepend `media/` anywhere else; this is the
 * single place that assembles it, specifically to make a `media/media/...`
 * duplication (Step 8's stated failure mode) structurally impossible.
 */
export function buildR2KeyFromRouteSegments(segments: string[]): string {
  return `media/${segments.join('/')}`;
}
