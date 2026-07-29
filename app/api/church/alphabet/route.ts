import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listAlphabetLetters } from '@/lib/d1/repositories/alphabet';

/** Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/alphabet`. */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const letters = await listAlphabetLetters({ language: searchParams.get('language') ?? undefined });
    return Response.json(letters);
  });
}
