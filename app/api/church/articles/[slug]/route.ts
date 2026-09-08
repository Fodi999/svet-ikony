import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listArticles } from '@/lib/d1/repositories/articles';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/articles/:slug`, composing `PublicChurchArticlePage`.
 * (No list endpoint: the frontend never calls a bare `/api/church/articles`.)
 *
 * PHASE MULTILINGUAL-1 / P0.1: a request for a language this article has no
 * published row in returns `{article: null, translations: [...]}`, never a
 * different language's row silently relabeled as the requested one. Unlike
 * icons/saints/prayers/alphabet, articles have no `translation_group_id` --
 * siblings are grouped by slug only.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;
    const language = languageResolution.language;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allArticles = await listArticles({});
    const siblings = allArticles.filter((item) => item.slug === slug);
    if (siblings.length === 0) return Response.json(null);

    const { match: article, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!article) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.title }));
      return Response.json({ article: null, icon: null, calendarDay: null, translations });
    }

    const [icons, calendarDays] = await Promise.all([
      article.iconId ? listIcons({}) : Promise.resolve([]),
      article.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const icon = article.iconId ? (icons.find((item) => item.id === article.iconId) ?? null) : null;
    const calendarDay = article.calendarDayId ? (calendarDays.find((day) => day.id === article.calendarDayId) ?? null) : null;
    const translations = published
      .filter((item) => item !== article)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    return Response.json({ article, icon, calendarDay, translations });
  });
}
