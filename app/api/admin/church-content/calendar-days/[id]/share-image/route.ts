import { shareCalendarImage } from '@/lib/church/share-calendar-image';
import { handleCalendarAiActionWithBody } from '@/lib/church/calendar-ai-route-helpers';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiActionWithBody<{ sourceId: string }>(request, params, (id, body) => shareCalendarImage(id, body.sourceId));
}
