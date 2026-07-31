const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Turns whatever a media field currently holds into something safe to put
 * in `<img src>`/`<audio src>`, without assuming every value is already a
 * URL. Transitional by design (Stage 2D) — most rows still hold whatever
 * the old Rust/Postgres backend put there, and this must not break those:
 *
 *  - null/undefined/"" -> undefined (render nothing, not a broken src)
 *  - absolute URL (has a scheme, or is protocol-relative "//host/...") ->
 *    left unchanged, except local/private-network `/media/*` URLs. Those
 *    are converted back to same-origin `/media/*` so production HTTPS pages
 *    never request `http://localhost` or another insecure LAN host.
 *  - a bare R2 object key (e.g. "media/prayers/<id>/audio/<uuid>.mp3",
 *    produced by lib/media/keys.ts) -> resolved to the public URL for
 *    GET /media/*. The key already contains its own leading `media/`
 *    segment, so this only ever adds a single leading slash — never a
 *    second `media/` (see keys.ts's
 *    buildR2KeyFromRouteSegments for the matching route-side half of this
 *    contract, and resolver.test.ts for the explicit anti-`media/media/`
 *    regression test).
 */
export function resolveMediaUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (HAS_SCHEME.test(trimmed)) {
    return localMediaPath(trimmed) || trimmed;
  }

  if (trimmed.startsWith('//')) {
    return localMediaPath(`https:${trimmed}`) || trimmed;
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return path;
}

function localMediaPath(value: string) {
  try {
    const url = new URL(value);
    if (!url.pathname.startsWith('/media/')) return '';
    return isLocalOrPrivateHost(url.hostname) ? `${url.pathname}${url.search}${url.hash}` : '';
  } catch {
    return '';
  }
}

function isLocalOrPrivateHost(hostname: string) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
    return true;
  }

  if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
    return true;
  }

  const private172 = hostname.match(/^172\.(\d{1,2})\./);
  if (private172) {
    const second = Number(private172[1]);
    return second >= 16 && second <= 31;
  }

  return false;
}
