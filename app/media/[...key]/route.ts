import { getMediaBucket } from '@/lib/d1/env';
import { buildR2KeyFromRouteSegments, validateMediaKey } from '@/lib/media/keys';
import { contentRangeHeader, parseRangeHeader } from '@/lib/media/range';

/**
 * Public, unauthenticated media delivery: `GET /media/*` -> `env.MEDIA_BUCKET`.
 * Every key served here was produced by lib/media/keys.ts's
 * generateMediaKey(), so it's always `media/{module}/{entityId}/{purpose}/
 * {uuid}.{ext}` — never overwritten, hence the long immutable Cache-Control.
 *
 * `params.key` is everything AFTER the literal `/media/` segment (Next's
 * own file-based routing already consumed that part matching this route
 * file's location) — buildR2KeyFromRouteSegments() is the one place that
 * adds the `media/` prefix back, exactly once, to reconstruct the real R2
 * key. Do not prepend `media/` anywhere else in this file.
 */

function notFound(): Response {
  return new Response(null, { status: 404 });
}

async function resolveKeyOrNull(segments: string[]): Promise<string | null> {
  const key = buildR2KeyFromRouteSegments(segments);
  if (!validateMediaKey(key)) return null;
  return key;
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = await resolveKeyOrNull(segments);
  if (!key) return notFound();

  const bucket = await getMediaBucket();
  const rangeHeader = request.headers.get('range');

  // Need the object's total size before we can validate a Range request —
  // head() is a metadata-only call, no body transfer.
  const head = await bucket.head(key);
  if (!head) return notFound();

  const parsedRange = parseRangeHeader(rangeHeader, head.size);
  if (parsedRange === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${head.size}` },
    });
  }

  const object = parsedRange ? await bucket.get(key, { range: parsedRange }) : await bucket.get(key);
  if (!object) return notFound();

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');

  if (parsedRange) {
    headers.set('Content-Length', String(parsedRange.length));
    headers.set('Content-Range', contentRangeHeader(parsedRange, head.size));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export async function HEAD(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = await resolveKeyOrNull(segments);
  if (!key) return notFound();

  const bucket = await getMediaBucket();
  const object = await bucket.head(key);
  if (!object) return notFound();

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(object.size));

  return new Response(null, { status: 200, headers });
}
