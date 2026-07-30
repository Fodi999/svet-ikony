import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { extractMediaKeyFromValue, validateMediaKey } from '@/lib/media/keys';
import { deletePrayer, getPrayer, updatePrayer, type ChurchPrayerPayload } from '@/lib/d1/repositories/prayers';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getPrayer(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchPrayerPayload;
    return Response.json(await updatePrayer(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await getPrayer(id);
    await deletePrayer(id);

    // Best-effort: the D1 delete above is the source of truth and has
    // already succeeded, so a failure here must not fail the request.
    // audio_url/image_url store the resolved absolute URL, not the bare
    // key (unlike Calendar Day's imageId) — extract it first.
    const bucket = await getMediaBucket();
    for (const rawValue of [existing.audioUrl, existing.imageUrl]) {
      const key = extractMediaKeyFromValue(rawValue);
      if (!key || !validateMediaKey(key)) continue;
      try {
        await bucket.delete(key);
      } catch {
        // Orphan cleanup is opportunistic; nothing to do if it fails.
      }
    }

    return new Response(null, { status: 204 });
  });
}
