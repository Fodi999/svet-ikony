import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import type { IconAiActionContext } from '@/lib/church/icon-ai-actions';

/**
 * Shared skeleton for every Icon AI action route (generate/regenerate
 * description/history/saint-image-description, fill missing) -- mirrors
 * lib/church/calendar-ai-route-helpers.ts exactly: `requireSuperAdmin` +
 * call exactly one action from lib/church/icon-ai-actions.ts, passed the
 * calling admin's id and the request. Every one of those actions may
 * create a human-authored ai_proposals row instead of writing directly
 * when the target is PUBLISHED (see writeOrPropose() in that module),
 * which needs both.
 */
export function handleIconAiAction(
  request: Request,
  params: Promise<{ id: string }>,
  action: (iconId: string, context: IconAiActionContext) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    const claims = await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await action(id, { request, adminUserId: claims.sub }));
  });
}
