import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';

/**
 * Shared skeleton for every Church Calendar AI action route (generate/
 * regenerate description/history/SEO/image, assign image, fill missing) --
 * each one is `requireSuperAdmin` + call exactly one action from
 * lib/church/calendar-ai-actions.ts. Mirrors
 * lib/telegram/content-plan-route-helpers.ts's own reasoning.
 */
export function handleCalendarAiAction(
  request: Request,
  params: Promise<{ id: string }>,
  action: (dayId: string) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await action(id));
  });
}

export function handleCalendarAiActionWithBody<TBody>(
  request: Request,
  params: Promise<{ id: string }>,
  action: (dayId: string, body: TBody) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const body = (await request.json()) as TBody;
    return Response.json(await action(id, body));
  });
}
