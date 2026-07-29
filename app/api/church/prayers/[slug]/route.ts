import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/prayers/:slug`, composing `PublicChurchPrayerPage`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allPrayers = await listPrayers({});
    const candidates = allPrayers.filter((item) => item.slug === slug);
    const prayer = (language ? candidates.find((item) => item.language === language) : undefined) ?? candidates[0];

    if (!prayer || (prayer.status !== 'published' && !preview)) {
      return Response.json(null);
    }

    const [icons, calendarDays] = await Promise.all([
      prayer.iconId ? listIcons({}) : Promise.resolve([]),
      prayer.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const icon = prayer.iconId ? (icons.find((item) => item.id === prayer.iconId) ?? null) : null;
    const calendarDay = prayer.calendarDayId ? (calendarDays.find((day) => day.id === prayer.calendarDayId) ?? null) : null;
    const translations = allPrayers
      .filter((item) => item.translationGroupId === prayer.translationGroupId && item.language !== prayer.language)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    return Response.json({ prayer, icon, calendarDay, translations });
  });
}
