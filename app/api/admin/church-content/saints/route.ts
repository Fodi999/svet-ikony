import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createSaint, listSaints, type ChurchSaintPayload } from '@/lib/d1/repositories/saints';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const saints = await listSaints({
      calendarDayId: searchParams.get('calendarDayId') ?? undefined,
      iconId: searchParams.get('iconId') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });
    return Response.json(saints);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchSaintPayload;
    const saint = await createSaint(payload);
    return Response.json(saint, { status: 201 });
  });
}
