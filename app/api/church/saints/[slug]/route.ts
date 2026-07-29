import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listSaints } from '@/lib/d1/repositories/saints';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/saints/:slug`, composing `PublicChurchSaintPage`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allSaints = await listSaints({});
    const candidates = allSaints.filter((item) => item.slug === slug);
    const saint = (language ? candidates.find((item) => item.language === language) : undefined) ?? candidates[0];

    if (!saint || (saint.status !== 'published' && !preview)) {
      return Response.json(null);
    }

    const [icons, calendarDays, prayers] = await Promise.all([
      saint.iconId ? listIcons({}) : Promise.resolve([]),
      saint.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
      listPrayers({}),
    ]);

    const icon = saint.iconId ? (icons.find((item) => item.id === saint.iconId) ?? null) : null;
    const calendarDay = saint.calendarDayId ? (calendarDays.find((day) => day.id === saint.calendarDayId) ?? null) : null;
    const relatedPrayers = icon ? prayers.filter((prayer) => prayer.iconId === icon.id) : [];
    const translations = allSaints
      .filter((item) => item.translationGroupId === saint.translationGroupId && item.language !== saint.language)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.name }));

    return Response.json({ saint, icon, calendarDay, prayers: relatedPrayers, translations });
  });
}
