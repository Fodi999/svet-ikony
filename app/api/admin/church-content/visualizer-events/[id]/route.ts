import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from '@/lib/media/keys';
import {
  deleteVisualizerEvent,
  getVisualizerEvent,
  listVisualizerEvents,
  updateVisualizerEvent,
  type ChurchVisualizerEventPayload,
} from '@/lib/d1/repositories/visualizerEvents';
import { deleteVisualizerModel, listVisualizerModels } from '@/lib/d1/repositories/visualizerModels';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getVisualizerEvent(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchVisualizerEventPayload;
    return Response.json(await updateVisualizerEvent(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await getVisualizerEvent(id);
    await deleteVisualizerEvent(id);

    // Only clean up this translation group's GLB models once its LAST
    // language row is gone -- deleting one of several sibling rows (e.g.
    // just the `en` translation) must not remove a model still shown for
    // the `uk`/`ru` siblings that remain.
    const remainingSiblings = await listVisualizerEvents({ translationGroupId: existing.translationGroupId });
    if (remainingSiblings.length === 0) {
      const models = await listVisualizerModels({ eventGroupId: existing.translationGroupId });
      const bucket = await getMediaBucket();
      for (const model of models) {
        // Best-effort: the D1 delete above is the source of truth and has
        // already succeeded, so a failure here must not fail the request.
        try {
          await deleteVisualizerModel(model.id);
        } catch {
          // opportunistic
        }
        if (validateMediaKey(model.r2Key)) {
          try {
            await bucket.delete(model.r2Key);
          } catch {
            // opportunistic
          }
        }
      }
    }

    return new Response(null, { status: 204 });
  });
}
