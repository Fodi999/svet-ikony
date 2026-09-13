import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { composeCalendarPages } from '@/lib/church-public/calendar-page';
import { selectCalendarDaysForLocale } from '@/lib/church-public/select-calendar-day';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/calendar?year=&month=`, returning `PublicChurchContentPage[]`.
 *
 * `status` gating added (Content Plan Stage 3A architecture unification):
 * previously this returned every calendar day regardless of draft/published
 * status, unlike every other public list route in this codebase.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : undefined;
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allDays = await listCalendarDays({ year, month });
    // Preview keeps every draft/language visible for admin review; the
    // public path picks one row per date matching `language` (falling
    // back to uk, then whatever's published) instead of returning every
    // published translation for dates that have more than one.
    const days = preview ? allDays : selectCalendarDaysForLocale(allDays, language);
    const pages = await composeCalendarPages(days, language, { preview });
    return Response.json(pages);
  });
}
