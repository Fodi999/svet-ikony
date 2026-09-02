import { generateCalendarImageFromPrompt } from '@/lib/church/calendar-ai-actions';
import { handleCalendarAiActionWithBody } from '@/lib/church/calendar-ai-route-helpers';

/** "Промпт для AI" -- generates directly from an admin-authored English
 * prompt, bypassing the saint-reference resolver. See
 * generateCalendarImageFromPrompt()'s own doc comment. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCalendarAiActionWithBody<{ prompt: string }>(request, params, (id, body) => generateCalendarImageFromPrompt(id, body.prompt));
}
