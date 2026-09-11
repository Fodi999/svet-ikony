import { requireAiAccess } from "@/lib/ai-access/service";
import { requireScope } from "@/lib/ai-access/policy";
import { withErrors, ApiError } from "@/lib/d1/errors";
import { getMediaBucket } from "@/lib/d1/env";
import { mediaKindForPurpose } from "@/lib/media/constants";
import { isAllowedModule, validateMediaKey } from "@/lib/media/keys";
import type { MediaObjectDto } from "@/lib/media/types";
import { mediaIsReferenced } from "@/lib/media/references";
import { getSiteUrl } from "@/lib/site";

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
    const a = await requireAiAccess(request, "media.read");
    requireScope(a.scopes, "r2.read");

    const { searchParams } = new URL(request.url);
    const mediaModule = searchParams.get("module") ?? undefined;
    if (mediaModule && !isAllowedModule(mediaModule)) {
      throw ApiError.validation(`Unknown module: ${mediaModule}`);
    }
    const cursor = searchParams.get("cursor") ?? undefined;

    const bucket = await getMediaBucket();
    const result = await bucket.list({
      prefix: mediaModule ? `media/${mediaModule}/` : "media/",
      cursor,
      limit: 100,
      include: ["customMetadata", "httpMetadata"],
    });

    const base = await getSiteUrl();
    const items: MediaObjectDto[] = result.objects.map((object) => ({
      key: object.key,
      url: `${base}/${object.key}`,
      contentType:
        object.httpMetadata?.contentType ?? "application/octet-stream",
      size: object.size,
      etag: object.etag,
      kind: mediaKindForPurpose(
        (object.customMetadata?.purpose as string | undefined) ?? "",
      ),
    }));

    return Response.json({
      items,
      cursor: result.truncated ? result.cursor : null,
    });
  });
}
