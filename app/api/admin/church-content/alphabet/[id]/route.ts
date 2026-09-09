import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { extractMediaKeyFromValue, validateMediaKey } from '@/lib/media/keys';
import { deleteAlphabetLetter, getAlphabetLetter, updateAlphabetLetter, type ChurchAlphabetLetterPayload } from '@/lib/d1/repositories/alphabet';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getAlphabetLetter(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchAlphabetLetterPayload;
    return Response.json(await updateAlphabetLetter(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await getAlphabetLetter(id);
    await deleteAlphabetLetter(id);

    // Best-effort: the D1 delete above is the source of truth and has
    // already succeeded, so a failure here must not fail the request.
    // card_image_url/main_image_url store the bare key (Icons' pattern);
    // audio_url stores the resolved absolute URL (Prayers' pattern) —
    // extract it back to a key first.
    const bucket = await getMediaBucket();
    const keys = new Set([existing.cardImageUrl, existing.mainImageUrl, extractMediaKeyFromValue(existing.audioUrl)]);
    for (const key of keys) {
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
