import { generateSlotImage } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction } from '@/lib/telegram/content-plan-route-helpers';

/** Generates an image for one slot -- never overwrites an existing image
 * (use regenerate-image). Reuses the existing verified-saint-image ->
 * AI-fallback priority unchanged. See content-plan-actions.ts's
 * generateSlotImage(). */
export async function POST(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, generateSlotImage);
}
