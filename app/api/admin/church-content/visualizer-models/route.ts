import { uploadedModelMetadata } from '@/lib/media/model-metadata';
import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createVisualizerModel, listVisualizerModels, type ChurchVisualizerModelPayload } from '@/lib/d1/repositories/visualizerModels';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const models = await listVisualizerModels({ eventGroupId: searchParams.get('eventGroupId') ?? undefined });
    return Response.json(models);
  });
}

/** Metadata-only create -- the binary GLB itself is uploaded first via the
 * existing generic /api/admin/media/upload route (module: "visualizer",
 * purpose: "model"), and this route is called afterward with the key that
 * upload returned, same two-step flow every other media-carrying module
 * already uses (upload -> get {key, url} -> save the key on the entity). */
export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchVisualizerModelPayload;
    const model = await createVisualizerModel({ ...payload, ...await uploadedModelMetadata(payload.r2Key), isBaseEarth: false });
    return Response.json(model, { status: 201 });
  });
}
