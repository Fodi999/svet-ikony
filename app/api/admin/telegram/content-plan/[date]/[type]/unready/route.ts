import { markSlotUnready } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction } from '@/lib/telegram/content-plan-route-helpers';

/** "Зняти з готовності" -- ready -> draft. See content-plan-actions.ts's
 * markSlotUnready(). */
export async function POST(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, markSlotUnready);
}
