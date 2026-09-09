import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { uploadedModelMetadata } from '@/lib/media/model-metadata';
import { removeUnreferencedModelFile } from '@/lib/media/references';
import {
  deleteVisualizerModel,
  getVisualizerModel,
  updateVisualizerModel,
  type ChurchVisualizerModelPayload,
} from '@/lib/d1/repositories/visualizerModels';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getVisualizerModel(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchVisualizerModelPayload;
    const previous = await getVisualizerModel(id);
    const metadata = payload.r2Key !== undefined ? await uploadedModelMetadata(payload.r2Key) : {};
    const updated = await updateVisualizerModel(id, { ...payload, ...metadata });
    if (previous.r2Key !== updated.r2Key) await removeUnreferencedModelFile(previous.r2Key);
    return Response.json(updated);
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    const existing = await getVisualizerModel(id);
    if (existing.isBaseEarth && !force) {
      throw ApiError.validation('Cannot delete the active Base Earth Model -- pass ?force=1 to confirm, or set a different model as base earth first');
    }

    await deleteVisualizerModel(id);

    await removeUnreferencedModelFile(existing.r2Key);

    return new Response(null, { status: 204 });
  });
}
