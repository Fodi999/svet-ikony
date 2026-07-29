import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createPrayer, listPrayers, type ChurchPrayerPayload } from '@/lib/d1/repositories/prayers';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const prayers = await listPrayers({
      calendarDayId: searchParams.get('calendarDayId') ?? undefined,
      iconId: searchParams.get('iconId') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });
    return Response.json(prayers);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchPrayerPayload;
    const prayer = await createPrayer(payload);
    return Response.json(prayer, { status: 201 });
  });
}
