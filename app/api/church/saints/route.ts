import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listSaints } from '@/lib/d1/repositories/saints';

/** Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/saints`. */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const saints = await listSaints({ language: searchParams.get('language') ?? undefined });
    return Response.json(saints);
  });
}
