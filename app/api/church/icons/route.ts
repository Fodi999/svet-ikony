import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listIcons } from '@/lib/d1/repositories/icons';
import { applyListLanguageFallback, resolveRequestedLanguage } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces the old Koyeb
 * `GET /api/church/icons`. Returns every icon regardless of status
 * (matches the old contract exactly — `lib/api.ts`'s `publicApi.icons()`
 * already filters to `status === 'published'` client-side after fetching).
 *
 * PHASE MULTILINGUAL-1 / P0.2: when an icon has no row in the requested
 * language, the catalog still lists it (via a published same-slug
 * fallback row, marked `translated: false`) instead of silently omitting
 * it -- so /ru/icons and /en/icons aren't empty just because RU/EN rows
 * don't exist yet. Opening such an item still goes through the by-slug
 * route's own P0.1 fix, which never pretends the body is translated.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;

    const allIcons = await listIcons({});
    const icons = applyListLanguageFallback(allIcons, languageResolution.language, (item) => item.translationGroupId);
    return Response.json(icons);
  });
}
