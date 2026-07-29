import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getChurchInfo, putChurchInfo, type ChurchInfoPayload } from '@/lib/d1/repositories/churchInfo';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await getChurchInfo());
  });
}

export async function PUT(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchInfoPayload;
    return Response.json(await putChurchInfo(payload));
  });
}
