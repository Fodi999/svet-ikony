import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listVisualizerEvents } from '@/lib/d1/repositories/visualizerEvents';
import { applyListLanguageFallback, resolveRequestedLanguage } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Same PHASE MULTILINGUAL-1 / P0.2 list-fallback
 * contract as saints/prayers/icons: when an event has no row in the
 * requested language, the list still includes it (via a published
 * same-group fallback row, marked `translated: false`) instead of silently
 * omitting it, so /ru/pravoslavna-istoriya isn't empty just because RU
 * rows don't exist yet for every event.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;

    const allEvents = await listVisualizerEvents({ status: 'published' });
    const events = applyListLanguageFallback(allEvents, languageResolution.language, (item) => item.translationGroupId);
    return Response.json(events);
  });
}
