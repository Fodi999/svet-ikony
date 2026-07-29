import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createCalendarDay, listCalendarDays, type ChurchCalendarDayPayload } from '@/lib/d1/repositories/calendarDays';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : undefined;
    const days = await listCalendarDays({ year, month });
    return Response.json(days);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchCalendarDayPayload;
    const day = await createCalendarDay(payload);
    return Response.json(day, { status: 201 });
  });
}
