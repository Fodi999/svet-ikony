import { generateIconPortfolio } from '@/lib/church/icon-portfolio-actions';
import { handleIconAiAction } from '@/lib/church/icon-ai-route-helpers';

/** No context needed -- generateIconPortfolio() never writes to the icon
 * row (see its own doc comment), only reads it and writes new R2 objects. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleIconAiAction(request, params, (iconId) => generateIconPortfolio(iconId));
}
