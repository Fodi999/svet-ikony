import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getDashboardStats } from '@/lib/d1/repositories/dashboard';

/** Phase 2B-6: read-only aggregate. No writes, no new auth model — same
 * requireSuperAdmin() service boundary as every other /api/admin/**
 * route. Response contains only cross-content aggregates and order
 * *counts* (never customer PII — no order rows, no names, no contact
 * info; see lib/d1/repositories/dashboard.ts). */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await getDashboardStats());
  });
}
