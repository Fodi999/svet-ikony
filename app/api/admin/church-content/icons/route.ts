import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createIcon, listIcons, type ChurchIconPayload } from '@/lib/d1/repositories/icons';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const icons = await listIcons({
      calendarDayId: searchParams.get('calendarDayId') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });
    return Response.json(icons);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchIconPayload;
    const icon = await createIcon(payload);
    return Response.json(icon, { status: 201 });
  });
}
