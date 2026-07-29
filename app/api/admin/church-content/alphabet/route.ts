import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createAlphabetLetter, listAlphabetLetters, type ChurchAlphabetLetterPayload } from '@/lib/d1/repositories/alphabet';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const letters = await listAlphabetLetters({ language: searchParams.get('language') ?? undefined });
    return Response.json(letters);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchAlphabetLetterPayload;
    const letter = await createAlphabetLetter(payload);
    return Response.json(letter, { status: 201 });
  });
}
