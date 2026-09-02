import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';

/**
 * Shared skeleton for every Content Plan Stage 2 admin write route
 * (generate/regenerate text or image, manual edit, media assign, mark
 * ready/unready) -- each one is `requireSuperAdmin` + validate `:date` +
 * call exactly one action from lib/telegram/content-plan-actions.ts. A
 * shared helper here means the auth check can't accidentally be forgotten
 * on any one of the eight near-identical route files.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function handleSlotAction(
  request: Request,
  params: Promise<{ date: string; type: string }>,
  action: (civilDate: string, contentType: string) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { date, type } = await params;
    if (!DATE_PATTERN.test(date)) throw ApiError.validation('date must be YYYY-MM-DD');
    return Response.json(await action(date, type));
  });
}

export function handleSlotActionWithBody<TBody>(
  request: Request,
  params: Promise<{ date: string; type: string }>,
  action: (civilDate: string, contentType: string, body: TBody) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { date, type } = await params;
    if (!DATE_PATTERN.test(date)) throw ApiError.validation('date must be YYYY-MM-DD');
    const body = (await request.json()) as TBody;
    return Response.json(await action(date, type, body));
  });
}
