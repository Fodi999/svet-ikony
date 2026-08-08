import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from '@/lib/media/keys';
import { deleteSaint, getSaint, updateSaint, type ChurchSaintPayload } from '@/lib/d1/repositories/saints';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getSaint(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchSaintPayload;
    return Response.json(await updateSaint(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await getSaint(id);
    await deleteSaint(id);

    // Best-effort: the D1 delete above is the source of truth and has
    // already succeeded, so a failure here must not fail the request.
    if (existing.imageUrl && validateMediaKey(existing.imageUrl)) {
      try {
        const bucket = await getMediaBucket();
        await bucket.delete(existing.imageUrl);
      } catch {
        // Orphan cleanup is opportunistic; nothing to do if it fails.
      }
    }

    return new Response(null, { status: 204 });
  });
}
