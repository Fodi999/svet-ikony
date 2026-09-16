import { fillMissingProductContent } from '@/lib/church/product-ai-actions';
import { handleProductAiActionNoBody } from '@/lib/church/product-ai-route-helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleProductAiActionNoBody(request, params, fillMissingProductContent);
}
