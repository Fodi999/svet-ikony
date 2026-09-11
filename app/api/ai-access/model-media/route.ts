import { withErrors, ApiError } from "@/lib/d1/errors";
import { getMediaBucket } from "@/lib/d1/env";
import { requireAiAccess, activity } from "@/lib/ai-access/service";
import { requireScope } from "@/lib/ai-access/policy";
async function handle(request: Request) {
  return withErrors(async () => {
    const a = await requireAiAccess(request, "visualizer.read");
    requireScope(a.scopes, "r2.read");
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (
      !/^media\/visualizer\/[a-zA-Z0-9_-]+\/model\/[a-f0-9-]+\.glb$/.test(key)
    )
      throw ApiError.validation("Invalid model key");
    const bucket = await getMediaBucket();
    const content = request.method === "HEAD" ? null : await bucket.get(key);
    const object = request.method === "HEAD" ? await bucket.head(key) : content;
    if (!object) throw ApiError.notFound("Model missing");
    await activity(a, "media", "read", key, "success", crypto.randomUUID());
    return new Response(content?.body ?? null, {
      headers: {
        "content-type":
          object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(object.size),
        etag: object.etag,
        "cache-control": "no-store",
      },
    });
  });
}
export { handle as GET, handle as HEAD };
