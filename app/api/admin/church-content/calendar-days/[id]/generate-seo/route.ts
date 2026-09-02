import { generateCalendarSeo } from '@/lib/church/calendar-ai-actions';
import { handleCalendarAiAction } from '@/lib/church/calendar-ai-route-helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiAction(request, params, generateCalendarSeo);
}
