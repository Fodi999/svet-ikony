import { markSlotReady } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction } from '@/lib/telegram/content-plan-route-helpers';

/** "Позначити готовим" -- draft -> ready, gated by the same
 * validateBeforeSend() the autopost tick and manual publish route already
 * trust. See content-plan-actions.ts's markSlotReady(). */
export async function POST(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, markSlotReady);
}
