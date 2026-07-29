import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createGospel, listGospel, type ChurchGospelPayload } from '@/lib/d1/repositories/gospel';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const gospel = await listGospel({
      calendarDayId: searchParams.get('calendarDayId') ?? undefined,
      iconId: searchParams.get('iconId') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });
    return Response.json(gospel);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchGospelPayload;
    const reading = await createGospel(payload);
    return Response.json(reading, { status: 201 });
  });
}
