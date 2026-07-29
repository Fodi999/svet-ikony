import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { composeCalendarPages } from '@/lib/church-public/calendar-page';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/calendar?year=&month=`, returning `PublicChurchContentPage[]`.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : undefined;
    const language = searchParams.get('language') ?? undefined;

    const days = await listCalendarDays({ year, month });
    const pages = await composeCalendarPages(days, language);
    return Response.json(pages);
  });
}
