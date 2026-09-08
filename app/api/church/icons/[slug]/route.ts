import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listArticles } from '@/lib/d1/repositories/articles';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces the old Koyeb
 * `GET /api/church/icons/:slug`, composing the same `PublicChurchIconPage`
 * shape (icon + its related prayers/articles/gospel/calendarDay +
 * translations) from D1 instead. See lib/types.ts's PublicChurchIconPage.
 *
 * PHASE MULTILINGUAL-1 / P0.1: a request for a language this icon has no
 * published row in returns `{icon: null, translations: [...]}`, never a
 * different language's row silently relabeled as the requested one.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;
    const language = languageResolution.language;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allIcons = await listIcons({});
    const candidates = allIcons.filter((item) => item.slug === slug);
    if (candidates.length === 0) return Response.json(null);

    const groupId = candidates[0].translationGroupId;
    const siblings = allIcons.filter((item) => item.translationGroupId === groupId);
    const { match: icon, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!icon) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.title }));
      return Response.json({ icon: null, calendarDay: null, prayers: [], articles: [], gospel: [], translations });
    }

    const [prayers, articles, gospel, calendarDays] = await Promise.all([
      listPrayers({ iconId: icon.id }),
      listArticles({ iconId: icon.id }),
      listGospel({ iconId: icon.id }),
      icon.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const calendarDay = icon.calendarDayId ? (calendarDays.find((day) => day.id === icon.calendarDayId) ?? null) : null;
    const translations = published
      .filter((item) => item !== icon)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    return Response.json({ icon, calendarDay, prayers, articles, gospel, translations });
  });
}
