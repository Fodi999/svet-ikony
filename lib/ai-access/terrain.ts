import { requireAiAccess, activity } from "./service";
import { requireScope } from "./policy";
import { getMediaBucket } from "@/lib/d1/env";
import { withErrors, ApiError } from "@/lib/d1/errors";
import { terrainPrefix } from "@/lib/terrain/contract";
import { TerrainStorage } from "@/lib/terrain/storage";
export { boundedBody } from "@/lib/terrain/http";
export function terrainHandler(
  request: Request,
  params: Promise<{ region: string; lod: string }>,
  fn: (s: TerrainStorage, r: string, l: number) => Promise<Response>,
) {
  return withErrors(async () => {
    const write = request.method !== "GET",
      a = await requireAiAccess(
        request,
        write ? "terrain.upload" : "terrain.read",
      );
    requireScope(a.scopes, write ? "r2.upload" : "r2.read");
    if (write && a.grant.mode !== "DRAFT_EDIT")
      throw ApiError.authorization("Draft access required");
    const p = await params,
      lod = /^L[123]$/.test(p.lod) ? Number(p.lod.slice(1)) : 0;
    terrainPrefix(p.region, lod);
    try {
      const result = await fn(
        new TerrainStorage(await getMediaBucket()),
        p.region,
        lod,
      );
      await activity(
        a,
        "terrain",
        write ? "upload" : "read",
        p.region + "/" + p.lod,
        result.ok ? "success" : "failed",
        crypto.randomUUID(),
      );
      return result;
    } catch (error) {
      await activity(
        a,
        "terrain",
        write ? "upload" : "read",
        p.region + "/" + p.lod,
        "failed",
        crypto.randomUUID(),
      );
      throw error;
    }
  });
}
