import { withErrors } from '@/lib/d1/errors';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { getAssetByPrayerId } from '@/lib/d1/repositories/prayerVisualizerAssets';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/prayers/:slug/visualizer`. Returns `null` when no
 * precomputed asset exists yet — same meaning as before ("not processed
 * yet", frontend falls back to client-side particle sampling); the
 * background processing pipeline that populates this table was never
 * ported (see lib/d1/repositories/prayers.ts's own note), so this
 * currently always returns null, same as it already did going through
 * Koyeb for any prayer whose asset hadn't been generated.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const prayers = await listPrayers({});
    const prayer = prayers.find((item) => item.slug === slug);
    if (!prayer) return Response.json(null);
    const asset = await getAssetByPrayerId(prayer.id);
    return Response.json(asset);
  });
}
