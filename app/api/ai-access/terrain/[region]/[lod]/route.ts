import { terrainHandler, boundedBody } from "@/lib/ai-access/terrain";
import {
  parseTerrainManifest,
  MAX_TERRAIN_MANIFEST_BYTES,
} from "@/lib/terrain/contract";
import { ApiError } from "@/lib/d1/errors";
type Context = { params: Promise<{ region: string; lod: string }> };
export function GET(request: Request, context: Context) {
  return terrainHandler(request, context.params, async (storage, region, lod) =>
    Response.json(await storage.status(region, lod), {
      headers: { "cache-control": "no-store" },
    }),
  );
}
export function POST(request: Request, context: Context) {
  return terrainHandler(
    request,
    context.params,
    async (storage, region, lod) => {
      let manifest;
      try {
        manifest = parseTerrainManifest(
          JSON.parse(
            new TextDecoder("utf8", { fatal: true }).decode(
              await boundedBody(request, MAX_TERRAIN_MANIFEST_BYTES),
            ),
          ),
        );
      } catch (error) {
        throw ApiError.validation(
          error instanceof Error ? error.message : "Invalid manifest",
        );
      }
      return Response.json(await storage.begin(region, lod, manifest));
    },
  );
}
