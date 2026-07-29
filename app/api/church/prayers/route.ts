import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listPrayers } from '@/lib/d1/repositories/prayers';

/** Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/prayers`. */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const prayers = await listPrayers({ language: searchParams.get('language') ?? undefined });
    return Response.json(prayers);
  });
}
