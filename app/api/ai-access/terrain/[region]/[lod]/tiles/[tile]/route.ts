import { terrainHandler, boundedBody } from "@/lib/ai-access/terrain";
import { MAX_TERRAIN_TILE_BYTES } from "@/lib/terrain/contract";
import { ApiError } from "@/lib/d1/errors";
export function PUT(
  request: Request,
  context: { params: Promise<{ region: string; lod: string; tile: string }> },
) {
  return terrainHandler(
    request,
    context.params,
    async (storage, region, lod) => {
      const { tile } = await context.params;
      const bundleId = request.headers.get("x-terrain-bundle-id") ?? "";
      if (!/^\d+_\d+$/.test(tile) || !/^[a-f0-9]{64}$/.test(bundleId))
        throw ApiError.validation("Invalid terrain tile/identity");
      return Response.json(
        await storage.tile(
          region,
          lod,
          tile,
          bundleId,
          await boundedBody(request, MAX_TERRAIN_TILE_BYTES),
          request.headers.get("content-type") ?? "",
        ),
      );
    },
  );
}
