import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors, ApiError } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from '@/lib/media/keys';

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
