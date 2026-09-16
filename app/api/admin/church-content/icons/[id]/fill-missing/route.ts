import { fillMissingIconContent } from '@/lib/church/icon-ai-actions';
import { handleIconAiAction } from '@/lib/church/icon-ai-route-helpers';

/** "Заповнити відсутнє з AI" -- fills only missing description/history/
 * saint-image-description fields; never overwrites existing content;
 * never publishes. A DRAFT icon is written directly; a PUBLISHED icon
 * instead becomes a pending proposal for human review. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleIconAiAction(request, params, fillMissingIconContent);
}
