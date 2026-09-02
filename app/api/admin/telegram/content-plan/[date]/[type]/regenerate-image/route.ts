import { regenerateSlotImage } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction } from '@/lib/telegram/content-plan-route-helpers';

/** Always attempts a fresh image; restores the previous one on failure
 * (never left blank). See content-plan-actions.ts's regenerateSlotImage(). */
export async function POST(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, regenerateSlotImage);
}
