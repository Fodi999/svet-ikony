import { regenerateProductSeoDescription } from '@/lib/church/product-ai-actions';
import { handleProductAiAction } from '@/lib/church/product-ai-route-helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleProductAiAction(request, params, regenerateProductSeoDescription);
}
