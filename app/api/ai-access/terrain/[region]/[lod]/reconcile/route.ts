import { terrainHandler } from "@/lib/ai-access/terrain";
import { ApiError } from "@/lib/d1/errors";
export function POST(
  request: Request,
  context: { params: Promise<{ region: string; lod: string }> },
) {
  return terrainHandler(
    request,
    context.params,
    async (storage, region, lod) => {
      const bundleId = request.headers.get("x-terrain-bundle-id") ?? "";
      if (!/^[a-f0-9]{64}$/.test(bundleId))
        throw ApiError.validation("Invalid bundle identity");
      return Response.json(await storage.reconcile(region, lod, bundleId));
    },
  );
}
