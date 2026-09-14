import { recommendPrayerForCalendarDay } from '@/lib/church/prayer-recommendation';
import { handleCalendarAiAction } from '@/lib/church/calendar-ai-route-helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiAction(request, params, recommendPrayerForCalendarDay);
}
