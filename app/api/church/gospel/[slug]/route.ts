import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/gospel/:slug`, composing `PublicChurchGospelPage`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allGospel = await listGospel({});
    const candidates = allGospel.filter((item) => item.slug === slug);
    const gospel = (language ? candidates.find((item) => item.language === language) : undefined) ?? candidates[0];

    if (!gospel || (gospel.status !== 'published' && !preview)) {
      return Response.json(null);
    }

    const [icons, calendarDays] = await Promise.all([
      gospel.iconId ? listIcons({}) : Promise.resolve([]),
      gospel.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const icon = gospel.iconId ? (icons.find((item) => item.id === gospel.iconId) ?? null) : null;
    const calendarDay = gospel.calendarDayId ? (calendarDays.find((day) => day.id === gospel.calendarDayId) ?? null) : null;

    return Response.json({ gospel, icon, calendarDay });
  });
}
