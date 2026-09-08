import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/gospel/:slug`, composing `PublicChurchGospelPage`.
 *
 * PHASE MULTILINGUAL-1 / P0.1: a request for a language this reading has no
 * published row in returns `{gospel: null, translations: [...]}`, never a
 * different language's row silently relabeled as the requested one. Unlike
 * icons/saints/prayers/alphabet, gospel readings have no
 * `translation_group_id` -- siblings are grouped by slug only.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;
    const language = languageResolution.language;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allGospel = await listGospel({});
    const siblings = allGospel.filter((item) => item.slug === slug);
    if (siblings.length === 0) return Response.json(null);

    const { match: gospel, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!gospel) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.title }));
      return Response.json({ gospel: null, icon: null, calendarDay: null, translations });
    }

    const [icons, calendarDays] = await Promise.all([
      gospel.iconId ? listIcons({}) : Promise.resolve([]),
      gospel.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const icon = gospel.iconId ? (icons.find((item) => item.id === gospel.iconId) ?? null) : null;
    const calendarDay = gospel.calendarDayId ? (calendarDays.find((day) => day.id === gospel.calendarDayId) ?? null) : null;
    const translations = published
      .filter((item) => item !== gospel)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    return Response.json({ gospel, icon, calendarDay, translations });
  });
}
