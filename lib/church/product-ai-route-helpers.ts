import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import type { ProductAiActionContext, ProductAiLanguage } from '@/lib/church/product-ai-actions';

const LANGUAGES: readonly ProductAiLanguage[] = ['uk', 'ru', 'en'];

function parseLanguage(body: unknown): ProductAiLanguage {
  const language = (body as { language?: unknown } | null)?.language;
  if (typeof language !== 'string' || !LANGUAGES.includes(language as ProductAiLanguage)) {
    throw ApiError.validation('language must be one of uk, ru, en');
  }
  return language as ProductAiLanguage;
}

/**
 * Shared skeleton for every per-field Product AI action route (generate/
 * regenerate full description/SEO title/SEO description) -- each one is
 * `requireSuperAdmin` + a `{ language: 'uk'|'ru'|'en' }` body + call
 * exactly one action from lib/church/product-ai-actions.ts, passed the
 * calling admin's id and the request. Every one of those actions may
 * create a human-authored ai_proposals row instead of writing directly
 * when the product is active (see writeOrPropose() in that module), which
 * needs both.
 */
export function handleProductAiAction(
  request: Request,
  params: Promise<{ id: string }>,
  action: (productId: string, language: ProductAiLanguage, context: ProductAiActionContext) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    const claims = await requireSuperAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const language = parseLanguage(body);
    return Response.json(await action(id, language, { request, adminUserId: claims.sub }));
  });
}

/** fillMissingProductContent takes no body -- it fills every missing field
 * across all three languages in one call. */
export function handleProductAiActionNoBody(
  request: Request,
  params: Promise<{ id: string }>,
  action: (productId: string, context: ProductAiActionContext) => Promise<unknown>
): Promise<Response> {
  return withErrors(async () => {
    const claims = await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await action(id, { request, adminUserId: claims.sub }));
  });
}
