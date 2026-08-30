import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors, ApiError } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { mediaKindForPurpose } from '@/lib/media/constants';
import { isAllowedModule, validateMediaKey } from '@/lib/media/keys';
import type { MediaObjectDto } from '@/lib/media/types';
import { absoluteSiteUrl } from '@/lib/site';

/**
 * GET /api/admin/media — lists existing R2 objects under `media/`, newest
 * first is NOT guaranteed (R2 `list()` orders by key, not upload time) —
 * good enough for a picker grid, not for a chronological feed. `module`
 * narrows to one module's prefix (e.g. `telegram` for the post composer's
 * media picker); omitted, it lists everything. Paginated via `cursor`
 * (opaque, pass the previous response's `cursor` back to continue).
 */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module') ?? undefined;
    if (module && !isAllowedModule(module)) {
      throw ApiError.validation(`Unknown module: ${module}`);
    }
    const cursor = searchParams.get('cursor') ?? undefined;

    const bucket = await getMediaBucket();
    const result = await bucket.list({
      prefix: module ? `media/${module}/` : 'media/',
      cursor,
      limit: 100,
      include: ['customMetadata', 'httpMetadata'],
    });

    const items: MediaObjectDto[] = result.objects.map((object) => ({
      key: object.key,
      url: absoluteSiteUrl(`/${object.key}`),
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      size: object.size,
      etag: object.etag,
      kind: mediaKindForPurpose((object.customMetadata?.purpose as string | undefined) ?? ''),
    }));

    return Response.json({ items, cursor: result.truncated ? result.cursor : null });
  });
}

/**
 * DELETE /api/admin/media — takes only an R2 key of the new `svetikony-media`
 * bucket, validated the same way GET /media/* validates one. Rejects
 * anything that isn't exactly the shape generateMediaKey() produces —
 * arbitrary keys, absolute URLs, and legacy backend URLs are all the same
 * "not a valid key" case to this endpoint, not different error paths, so
 * there's no way to probe it into deleting something outside `media/`.
 *
 * No automatic orphan cleanup and nothing calls this from a form yet (Stage
 * 2D) — it exists so a deletion can be triggered deliberately, later, once
 * a module actually needs it.
 */
export async function DELETE(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw ApiError.validation('Request body must be JSON');
    }

    const key = (body as { key?: unknown } | null)?.key;
    if (typeof key !== 'string' || !key) {
      throw ApiError.validation('key is required');
    }
    if (!validateMediaKey(key)) {
      throw ApiError.validation('key is not a valid media object key');
    }

    const bucket = await getMediaBucket();
    const existing = await bucket.head(key);
    if (!existing) {
      throw ApiError.notFound('media object not found');
    }

    await bucket.delete(key);
    return Response.json({ key, deleted: true });
  });
}
