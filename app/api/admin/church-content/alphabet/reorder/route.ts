import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { reorderAlphabetLetters } from '@/lib/d1/repositories/alphabet';

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const orderedGroupIds = await request.json() as string[];
    await reorderAlphabetLetters(orderedGroupIds);
    return new Response(null, { status: 204 });
  });
}
