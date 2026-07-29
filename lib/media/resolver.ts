import { absoluteSiteUrl } from '@/lib/site';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Turns whatever a media field currently holds into something safe to put
 * in `<img src>`/`<audio src>`, without assuming every value is already a
 * URL. Transitional by design (Stage 2D) — most rows still hold whatever
 * the old Rust/Postgres backend put there, and this must not break those:
 *
 *  - null/undefined/"" -> undefined (render nothing, not a broken src)
 *  - absolute URL (has a scheme, or is protocol-relative "//host/...") ->
 *    left completely unchanged, whether it's an old-backend URL or a
 *    genuinely external one — this function does not know or care which,
 *    and must never try to "fix" or migrate it
 *  - a bare R2 object key (e.g. "media/prayers/<id>/audio/<uuid>.mp3",
 *    produced by lib/media/keys.ts) -> resolved to the public URL for
 *    GET /media/*. The key already contains its own leading `media/`
 *    segment, so this only ever adds a single leading slash + the site
 *    origin — never a second `media/` (see keys.ts's
 *    buildR2KeyFromRouteSegments for the matching route-side half of this
 *    contract, and resolver.test.ts for the explicit anti-`media/media/`
 *    regression test).
 */
export function resolveMediaUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (HAS_SCHEME.test(trimmed) || trimmed.startsWith('//')) {
    return trimmed;
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return absoluteSiteUrl(path);
}
