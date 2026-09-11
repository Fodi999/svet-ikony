import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import type { CalendarAiActionContext } from '@/lib/church/calendar-ai-actions';

/**
 * Shared skeleton for every Church Calendar AI action route (generate/
 * regenerate description/history/SEO/image, fill missing) -- each one is
 * `requireSuperAdmin` + call exactly one action from
 * lib/church/calendar-ai-actions.ts, passed the calling admin's id and the
 * request. Every one of those actions may create a human-authored
 * ai_proposals row instead of writing directly when the target is
 * PUBLISHED (see writeOrPropose() in that module), which needs both.
 * Mirrors lib/telegram/content-plan-route-helpers.ts's own reasoning.
 */
export function handleCalendarAiAction(
  request: Request,
  params: Promise<{ id: string }>,
  action: (dayId: string, context: CalendarAiActionContext) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    const claims = await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await action(id, { request, adminUserId: claims.sub }));
  });
}

/**
 * assignCalendarImage (the only body-carrying action that does NOT follow
 * the draft/published policy above -- see its own doc comment) still only
 * needs `(id, body)`; a context argument it never reads costs it nothing to
 * receive, so this stays a single generic helper rather than two.
 */
export function handleCalendarAiActionWithBody<TBody>(
  request: Request,
  params: Promise<{ id: string }>,
  action: (dayId: string, body: TBody, context: CalendarAiActionContext) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    const claims = await requireSuperAdmin(request);
    const { id } = await params;
    const body = (await request.json()) as TBody;
    return Response.json(await action(id, body, { request, adminUserId: claims.sub }));
  });
}
