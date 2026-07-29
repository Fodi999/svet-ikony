import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listIcons } from '@/lib/d1/repositories/icons';

/**
 * Public — no admin auth. Stage 2E cutover: replaces the old Koyeb
 * `GET /api/church/icons`. Returns every icon regardless of status
 * (matches the old contract exactly — `lib/api.ts`'s `publicApi.icons()`
 * already filters to `status === 'published'` client-side after fetching).
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const icons = await listIcons({ language: searchParams.get('language') ?? undefined });
    return Response.json(icons);
  });
}
