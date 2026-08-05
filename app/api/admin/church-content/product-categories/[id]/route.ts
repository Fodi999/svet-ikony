import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from '@/lib/media/keys';
import { deleteProductCategory, getProductCategory, updateProductCategory, type ChurchProductCategoryPayload } from '@/lib/d1/repositories/productCategories';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getProductCategory(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchProductCategoryPayload;
    return Response.json(await updateProductCategory(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await getProductCategory(id);
    await deleteProductCategory(id);

    // Best-effort: the D1 delete above is the source of truth and has
    // already succeeded, so a failure here must not fail the request.
    // Unlike Prayer's audioUrl/imageUrl (full resolved URLs), imageUrl
    // here stores the bare R2 key directly (same as Calendar Day's
    // imageId) — no URL-to-key extraction needed.
    if (validateMediaKey(existing.imageUrl)) {
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
