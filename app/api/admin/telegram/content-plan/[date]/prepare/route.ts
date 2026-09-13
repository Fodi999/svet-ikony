import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { prepareContentPlanDay } from '@/lib/telegram/content-plan-actions';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "Підготувати весь день" -- fills missing text/images for every available
 * slot of :date, leaving sent/sending/ready slots and any already-prepared
 * content untouched. See lib/telegram/content-plan-actions.ts's
 * prepareContentPlanDay(). Never sends Telegram, never marks anything ready. */
export async function POST(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { date } = await params;
    if (!DATE_PATTERN.test(date)) throw ApiError.validation('date must be YYYY-MM-DD');
    const text = await request.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { throw ApiError.validation('Invalid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'contentType') ||
        (body.contentType !== undefined && typeof body.contentType !== 'string')) throw ApiError.validation('Invalid preparation request');
    return Response.json(await prepareContentPlanDay(date, body.contentType));
  });
}
