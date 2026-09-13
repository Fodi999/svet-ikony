import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { composeCalendarPages } from '@/lib/church-public/calendar-page';
import { selectCalendarDay } from '@/lib/church-public/select-calendar-day';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/calendar/today`.
 * `status` gating added -- see `[date]/route.ts`'s doc comment for why.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));
    const today = new Date().toISOString().slice(0, 10);

    const allDays = await listCalendarDays({});
    // Was a plain .find() by date alone -- whichever row sorted first
    // (any language, any status) won, then only its own status was
    // checked. selectCalendarDay() picks the row matching `language`
    // (falling back to uk, then anything published) the same way the
    // single-day page and the month list already do.
    const day = selectCalendarDay(allDays, today, language, preview);
    if (!day) return Response.json(null);

    const [page] = await composeCalendarPages([day], language, { preview });
    return Response.json(page ?? null);
  });
}
