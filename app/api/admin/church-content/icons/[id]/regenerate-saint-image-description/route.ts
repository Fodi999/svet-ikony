import { regenerateIconSaintImageDescription } from '@/lib/church/icon-ai-actions';
import { handleIconAiAction } from '@/lib/church/icon-ai-route-helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleIconAiAction(request, params, regenerateIconSaintImageDescription);
}
