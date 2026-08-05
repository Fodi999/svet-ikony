import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from '@/lib/media/keys';
import { deleteProduct, getProduct, updateProduct, type ChurchProductPayload } from '@/lib/d1/repositories/products';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getProduct(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchProductPayload;
    return Response.json(await updateProduct(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await getProduct(id);
    await deleteProduct(id);

    // Best-effort: the D1 delete above is the source of truth and has
    // already succeeded, so a failure here must not fail the request.
    // Unlike Prayer's audioUrl/imageUrl (full resolved URLs), photoUrl/
    // galleryUrls here store bare R2 keys directly (same as Calendar
    // Day's imageId) — no URL-to-key extraction needed. De-duplicate
    // since photoUrl is always also present in galleryUrls (see
    // lib/api/http/products.ts's toPayload()).
    const bucket = await getMediaBucket();
    const keys = new Set([existing.photoUrl, ...existing.galleryUrls]);
    for (const key of keys) {
      if (!validateMediaKey(key)) continue;
      try {
        await bucket.delete(key);
      } catch {
        // Orphan cleanup is opportunistic; nothing to do if it fails.
      }
    }

    return new Response(null, { status: 204 });
  });
}
