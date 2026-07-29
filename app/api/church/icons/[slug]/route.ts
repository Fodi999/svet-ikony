import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listArticles } from '@/lib/d1/repositories/articles';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces the old Koyeb
 * `GET /api/church/icons/:slug`, composing the same `PublicChurchIconPage`
 * shape (icon + its related prayers/articles/gospel/calendarDay +
 * translations) from D1 instead. See lib/types.ts's PublicChurchIconPage.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allIcons = await listIcons({});
    const candidates = allIcons.filter((item) => item.slug === slug);
    const icon = (language ? candidates.find((item) => item.language === language) : undefined) ?? candidates[0];

    if (!icon || (icon.status !== 'published' && !preview)) {
      return Response.json(null);
    }

    const [prayers, articles, gospel, calendarDays] = await Promise.all([
      listPrayers({ iconId: icon.id }),
      listArticles({ iconId: icon.id }),
      listGospel({ iconId: icon.id }),
      icon.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const calendarDay = icon.calendarDayId ? (calendarDays.find((day) => day.id === icon.calendarDayId) ?? null) : null;
    const translations = allIcons
      .filter((item) => item.translationGroupId === icon.translationGroupId && item.language !== icon.language)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    return Response.json({ icon, calendarDay, prayers, articles, gospel, translations });
  });
}
