import { assignCalendarImage } from '@/lib/church/calendar-ai-actions';
import { handleCalendarAiActionWithBody } from '@/lib/church/calendar-ai-route-helpers';

/** "Обрати з медіатеки" -- assigns an already-uploaded R2 key/URL directly. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiActionWithBody<{ imageUrl: string }>(request, params, (id, body) => assignCalendarImage(id, body.imageUrl));
}
