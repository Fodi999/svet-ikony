import { fillMissingCalendarContent } from '@/lib/church/calendar-ai-actions';
import { handleCalendarAiAction } from '@/lib/church/calendar-ai-route-helpers';

/** "Заповнити відсутнє з AI" -- fills only missing description/history/
 * SEO/image fields; never overwrites existing content; never publishes. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiAction(request, params, fillMissingCalendarContent);
}
