import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { composeCalendarPages } from '@/lib/church-public/calendar-page';

/** Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/calendar/:date`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  return withErrors(async () => {
    const { date } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;

    const allDays = await listCalendarDays({});
    const day = allDays.find((item) => item.dateNewStyle === date || item.dateOldStyle === date);
    if (!day) return Response.json(null);

    const [page] = await composeCalendarPages([day], language);
    return Response.json(page ?? null);
  });
}
