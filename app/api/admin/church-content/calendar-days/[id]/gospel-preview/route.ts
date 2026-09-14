import { previewGospelReadingForCalendarDay } from '@/lib/church/gospel-reading-preparation';
import { handleCalendarAiAction } from '@/lib/church/calendar-ai-route-helpers';

/**
 * Read-only counterpart to prepare-gospel/route.ts -- resolves the day's
 * canonical citation without creating a Gospel reading, for the AI
 * preparation review step. handleCalendarAiAction is method-agnostic
 * (requireSuperAdmin + call the action + JSON respond), so it's reused
 * unchanged here for a GET.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiAction(request, params, previewGospelReadingForCalendarDay);
}
