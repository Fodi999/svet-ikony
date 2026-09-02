import { editSlotText } from '@/lib/telegram/content-plan-actions';
import { handleSlotActionWithBody } from '@/lib/telegram/content-plan-route-helpers';

type EditTextBody = { text: string };

/** Manual text edit -- no AI involved. Creates the slot's row if none
 * exists yet. See content-plan-actions.ts's editSlotText(). */
export async function PUT(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotActionWithBody<EditTextBody>(request, params, (date, type, body) => editSlotText(date, type, body.text));
}
