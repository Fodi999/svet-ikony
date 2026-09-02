import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { buildContentPlanDayDetail } from '@/lib/telegram/content-plan';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Single-day detail for the Content Plan drawer -- fetched only when the
 * admin opens a specific day, so the bulk year view (GET .../content-plan)
 * never has to carry full text/images for 365 days. Read-only, same as
 * the bulk endpoint -- see lib/telegram/content-plan.ts.
 */
export async function GET(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { date } = await params;
    if (!DATE_PATTERN.test(date)) throw ApiError.validation('date must be YYYY-MM-DD');

    return Response.json(await buildContentPlanDayDetail(date));
  });
}
