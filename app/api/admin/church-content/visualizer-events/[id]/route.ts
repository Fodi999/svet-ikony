import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { removeUnreferencedModelFile } from '@/lib/media/references';
import {
  deleteVisualizerEvent,
  getVisualizerEvent,
  listVisualizerEvents,
  updateVisualizerEvent,
  type ChurchVisualizerEventPayload,
} from '@/lib/d1/repositories/visualizerEvents';
import { deleteVisualizerModel, listVisualizerModels, updateVisualizerModel } from '@/lib/d1/repositories/visualizerModels';

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
      for (const model of models) {
        if (model.isBaseEarth) {
          await updateVisualizerModel(model.id, { eventGroupId: null });
          continue;
        }
        await deleteVisualizerModel(model.id);
        await removeUnreferencedModelFile(model.r2Key);
      }
    }

    return new Response(null, { status: 204 });
  });
}
