import { withErrors } from '@/lib/d1/errors';
import { getBaseEarthModel } from '@/lib/d1/repositories/visualizerModels';
import { resolveMediaUrl } from '@/lib/media/resolver';

/**
 * Public — no admin auth. The frontend must never hardcode a GLB filename
 * (e.g. earth_web.glb) -- it always asks this route for whichever model is
 * currently marked as the active Base Earth Model (there is always at most
 * one, enforced by a partial unique index — see migrations/0019_visualizer.sql).
 * Returns `null` if no base earth model has been uploaded/marked yet.
 */
export async function GET() {
  return withErrors(async () => {
    const model = await getBaseEarthModel();
    if (!model) return Response.json(null);
    return Response.json({ ...model, url: resolveMediaUrl(model.r2Key) });
  });
}
