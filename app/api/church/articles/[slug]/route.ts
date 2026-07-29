import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listArticles } from '@/lib/d1/repositories/articles';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/articles/:slug`, composing `PublicChurchArticlePage`.
 * (No list endpoint: the frontend never calls a bare `/api/church/articles`.)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allArticles = await listArticles({});
    const candidates = allArticles.filter((item) => item.slug === slug);
    const article = (language ? candidates.find((item) => item.language === language) : undefined) ?? candidates[0];

    if (!article || (article.status !== 'published' && !preview)) {
      return Response.json(null);
    }

    const [icons, calendarDays] = await Promise.all([
      article.iconId ? listIcons({}) : Promise.resolve([]),
      article.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const icon = article.iconId ? (icons.find((item) => item.id === article.iconId) ?? null) : null;
    const calendarDay = article.calendarDayId ? (calendarDays.find((day) => day.id === article.calendarDayId) ?? null) : null;

    return Response.json({ article, icon, calendarDay });
  });
}
