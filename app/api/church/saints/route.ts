import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listSaints } from '@/lib/d1/repositories/saints';
import { applyListLanguageFallback, resolveRequestedLanguage } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/saints`.
 *
 * PHASE MULTILINGUAL-1 / P0.2: when a saint has no row in the requested
 * language, the catalog still lists it (via a published same-slug
 * fallback row, marked `translated: false`) instead of silently omitting
 * it -- so /ru/saints and /en/saints aren't empty just because RU/EN rows
 * don't exist yet. Opening such an item still goes through the by-slug
 * route's own P0.1 fix, which never pretends the body is translated.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;

    const allSaints = await listSaints({});
    const saints = applyListLanguageFallback(allSaints, languageResolution.language, (item) => item.translationGroupId);
    return Response.json(saints);
  });
}
