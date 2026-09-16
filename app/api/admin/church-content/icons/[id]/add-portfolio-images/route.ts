import { addIconPortfolioImages, type GeneratedPortfolioPhoto } from '@/lib/church/icon-portfolio-actions';
import { handleIconAiActionWithBody } from '@/lib/church/icon-ai-route-helpers';

type Body = { images: GeneratedPortfolioPhoto[] };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleIconAiActionWithBody<Body>(request, params, (iconId, body, context) =>
    addIconPortfolioImages(iconId, body?.images ?? [], context)
  );
}
