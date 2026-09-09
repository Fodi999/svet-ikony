import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listVisualizerEvents } from '@/lib/d1/repositories/visualizerEvents';
import { listVisualizerModels } from '@/lib/d1/repositories/visualizerModels';
import { resolveMediaUrl } from '@/lib/media/resolver';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Same PHASE MULTILINGUAL-1 / P0.1 contract as
 * alphabet's by-slug route: a request for a language this event has no
 * published row in returns `{event: null, translations: [...]}`, never a
 * different language's row silently relabeled as the requested one.
 *
 * The response also includes `models` — every GLB attached to this event's
 * translation group (shared across its uk/ru/en rows, not per-language —
 * see migrations/0019_visualizer.sql), with `r2_key` resolved to a
 * servable URL.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;
    const language = languageResolution.language;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allEvents = await listVisualizerEvents({});
    const candidates = allEvents.filter((item) => item.slug === slug);
    if (candidates.length === 0) return Response.json(null);

    const groupId = candidates[0].translationGroupId;
    const siblings = allEvents.filter((item) => item.translationGroupId === groupId);
    const { match: event, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!event) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.title }));
      return Response.json({ event: null, translations, models: [] });
    }

    const translations = published
      .filter((item) => item !== event)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    const rawModels = await listVisualizerModels({ eventGroupId: groupId });
    const models = rawModels.map((model) => ({ ...model, url: resolveMediaUrl(model.r2Key) }));

    return Response.json({ event, translations, models });
  });
}
