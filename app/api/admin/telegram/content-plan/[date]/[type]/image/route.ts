import { assignSlotImage } from '@/lib/telegram/content-plan-actions';
import { handleSlotActionWithBody } from '@/lib/telegram/content-plan-route-helpers';

type AssignImageBody = { mediaUrl: string };

/** "Обрати з медіатеки" -- persists an already-uploaded R2 URL directly,
 * no new upload, no AI call. See content-plan-actions.ts's
 * assignSlotImage(). */
export async function PUT(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotActionWithBody<AssignImageBody>(request, params, (date, type, body) => assignSlotImage(date, type, body.mediaUrl));
}
