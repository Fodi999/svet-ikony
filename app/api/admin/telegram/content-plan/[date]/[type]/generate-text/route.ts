import { generateSlotText } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction } from '@/lib/telegram/content-plan-route-helpers';

/** Generates fresh AI text for one slot -- never overwrites existing text
 * (use regenerate-text for that) and never calls Telegram. See
 * lib/telegram/content-plan-actions.ts's generateSlotText(). */
export async function POST(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, generateSlotText);
}
