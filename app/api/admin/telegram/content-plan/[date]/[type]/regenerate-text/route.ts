import { regenerateSlotText } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction } from '@/lib/telegram/content-plan-route-helpers';

/** Always overwrites existing text (explicit action -- the admin UI is
 * expected to confirm before calling this). Demotes ready->draft, never
 * touches a sent/sending row. See content-plan-actions.ts's
 * regenerateSlotText(). */
export async function POST(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, regenerateSlotText);
}
