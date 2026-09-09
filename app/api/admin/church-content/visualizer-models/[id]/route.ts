import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from '@/lib/media/keys';
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
    return Response.json(await updateVisualizerModel(id, payload));
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

    // Best-effort: the D1 delete above is the source of truth and has
    // already succeeded, so a failure here must not fail the request.
    if (validateMediaKey(existing.r2Key)) {
      try {
        const bucket = await getMediaBucket();
        await bucket.delete(existing.r2Key);
      } catch {
        // opportunistic
      }
    }

    return new Response(null, { status: 204 });
  });
}
