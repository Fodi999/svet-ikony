import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { composeCalendarPages } from '@/lib/church-public/calendar-page';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/calendar/:date`.
 *
 * `status` gating added (Content Plan Stage 3A architecture unification):
 * previously a draft day was returned identically to a published one, the
 * only public route in this codebase without that check (every by-slug
 * route for saints/prayers/gospel/articles/icons already gates this).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  return withErrors(async () => {
    const { date } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allDays = await listCalendarDays({});
    const day = allDays.find((item) => item.dateNewStyle === date || item.dateOldStyle === date);
    if (!day || (day.status !== 'published' && !preview)) return Response.json(null);

    const [page] = await composeCalendarPages([day], language, { preview });
    return Response.json(page ?? null);
  });
}
