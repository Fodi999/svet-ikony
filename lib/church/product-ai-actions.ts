import { checkContentLanguage } from '@/lib/ai/language-guard';
import { generateProductContent, type ProductContentKind } from '@/lib/ai/product-content';
import { ApiError } from '@/lib/d1/errors';
import { listIcons, type ChurchIconDto } from '@/lib/d1/repositories/icons';
import { getProduct, updateProduct, type ChurchProductDto } from '@/lib/d1/repositories/products';
import { getOpenAiConfig } from '@/lib/telegram/env';

/**
 * AI shop-copy actions for the Product editor -- deliberately parallel to
 * lib/church/icon-ai-actions.ts (same write-routing rule, same
 * language-safety gate, same "never overwrite existing content" rule for
 * the plain generate* actions), adapted to two structural differences:
 *
 *  - icon_order_options has NO status column (unlike church_icons'
 *    draft/published/archived) -- only `is_active` (boolean). `isActive:
 *    false` is this entity's "draft" (product-form.tsx's own Publish
 *    button sets `active: true`, confirming this mapping), `isActive:
 *    true` is "published": every automatic write is routed accordingly,
 *    exactly like icons' draft-direct/published-proposal split.
 *  - icon_order_options is ONE ROW holding all three languages as separate
 *    columns (name_uk/ru/en, full_description_uk/ru/en, seo_title_uk/ru/en,
 *    seo_description_uk/ru/en) -- unlike icons' one-row-per-language.
 *    Every action here therefore takes an explicit `language` parameter
 *    rather than operating on "this record's own language".
 *
 * Every action:
 *  - REFUSES outright when the product has no linkedIconTranslationGroupId
 *    -- there is no factual source to write from, and this is never
 *    silently worked around (task: "must not invent saint identity, feast,
 *    materials, dimensions, provenance...");
 *  - draws facts ONLY from the linked icon's own persisted fields
 *    (title/saintName/feastName/description/history/
 *    saintImageDescription/materials/dimensions) -- never from an
 *    AI-generated portfolio photo's gallery metadata (that carries no
 *    descriptive content to extract as a "fact" in the first place, and
 *    is explicitly not evidence of real materials/dimensions/provenance);
 *  - never overwrites a field that already has content (use the paired
 *    regenerate* action for that);
 *  - never touches price/currency/stock/production time/consecration/
 *    name/slug/category/photos -- structurally impossible via this
 *    module (it only ever builds a patch containing one or more of the 9
 *    marketing/SEO text columns), and additionally blocked at the schema
 *    level for the published/proposal path (see CATALOG.products in
 *    lib/ai-access/catalog.ts, which doesn't list those fields at all).
 */

export type ProductAiActionContext = { request: Request; adminUserId: string };
export type ProductAiActionResult =
  | { mode: 'direct'; product: ChurchProductDto }
  | { mode: 'proposal'; product: ChurchProductDto; proposalId: string };

export type ProductAiLanguage = 'uk' | 'ru' | 'en';
export type ProductAiKind = ProductContentKind; // 'fullDescription' | 'seoTitle' | 'seoDescription'
const KINDS: readonly ProductAiKind[] = ['fullDescription', 'seoTitle', 'seoDescription'];

type ProductTextField =
  | 'fullDescriptionUk' | 'fullDescriptionRu' | 'fullDescriptionEn'
  | 'seoTitleUk' | 'seoTitleRu' | 'seoTitleEn'
  | 'seoDescriptionUk' | 'seoDescriptionRu' | 'seoDescriptionEn';

const FIELD_KEY: Record<ProductAiLanguage, Record<ProductAiKind, ProductTextField>> = {
  uk: { fullDescription: 'fullDescriptionUk', seoTitle: 'seoTitleUk', seoDescription: 'seoDescriptionUk' },
  ru: { fullDescription: 'fullDescriptionRu', seoTitle: 'seoTitleRu', seoDescription: 'seoDescriptionRu' },
  en: { fullDescription: 'fullDescriptionEn', seoTitle: 'seoTitleEn', seoDescription: 'seoDescriptionEn' },
};
const NAME_KEY: Record<ProductAiLanguage, 'nameUk' | 'nameRu' | 'nameEn'> = {
  uk: 'nameUk', ru: 'nameRu', en: 'nameEn',
};
const KIND_LABELS: Record<ProductAiKind, string> = {
  fullDescription: 'повний опис товару',
  seoTitle: 'SEO-заголовок',
  seoDescription: 'SEO-опис',
};

function currentValue(product: ChurchProductDto, language: ProductAiLanguage, kind: ProductAiKind): string {
  return product[FIELD_KEY[language][kind]];
}

/** Same write-routing rule as icon-ai-actions.ts's writeOrPropose(),
 * mapped onto isActive instead of a status enum (see module doc comment). */
async function writeOrPropose(
  product: ChurchProductDto,
  patch: Record<string, unknown>,
  context: ProductAiActionContext,
  reason: string
): Promise<ProductAiActionResult> {
  if (!product.isActive) return { mode: 'direct', product: await updateProduct(product.id, patch) };
  const { createHumanAuthoredProposal } = await import('@/lib/ai-access/proposals');
  const proposal = await createHumanAuthoredProposal(context.request, context.adminUserId, 'products', product.id, patch, reason);
  return { mode: 'proposal', product, proposalId: proposal.id };
}

/**
 * Resolves the linked icon's facts for a given language -- refuses
 * outright (task: "If no linkedIconId exists, AI generation must refuse
 * with a clear UI message") if the product has no link at all, or if the
 * linked group has been fully deleted since linking. Prefers the exact
 * requested language's icon row; falls back to whichever sibling in the
 * group actually has facts, then to the group's first row, mirroring
 * icon-ai-actions.ts's own loadPrimarySiblingFacts() fallback reasoning.
 */
async function requireLinkedIconFacts(product: ChurchProductDto, language: ProductAiLanguage): Promise<ChurchIconDto> {
  if (!product.linkedIconTranslationGroupId) {
    throw ApiError.validation("Цей товар не пов'язаний з жодною іконою -- спочатку оберіть пов'язану ікону, щоб AI мав факти для генерації.");
  }
  const icons = await listIcons({});
  const group = icons.filter((icon) => icon.translationGroupId === product.linkedIconTranslationGroupId);
  if (group.length === 0) {
    throw ApiError.validation("Пов'язану ікону не знайдено -- можливо, її було видалено.");
  }
  const hasFacts = (icon: ChurchIconDto) => Boolean(icon.saintName || icon.description || icon.history || icon.saintImageDescription);
  const exact = group.find((icon) => icon.language === language);
  // Only trust the exact-language row if it actually has facts -- a
  // freshly-created translation row (task: same fallback breadth as
  // icon-ai-actions.ts's loadPrimarySiblingFacts) has none yet, so
  // preferring it over a sibling that DOES have facts would silently
  // starve the AI of everything except the bare title.
  if (exact && hasFacts(exact)) return exact;
  return group.find(hasFacts) ?? exact ?? group[0];
}

/**
 * Facts drawn ONLY from the linked icon's own persisted fields. Unlike
 * icon-ai-actions.ts's own buildFacts() (which deliberately EXCLUDES
 * materials/dimensions when writing an icon's own religious/historical
 * copy -- irrelevant there), this INCLUDES them: a product's shop copy
 * legitimately describes materials/dimensions as real sales facts (task:
 * "Prefer factual copy derived from the linked icon's persisted fields:
 * ...materials, dimensions"). Never includes the product's own price/
 * stock/production time/consecration (the system prompt in
 * lib/ai/product-content.ts additionally instructs the model to never
 * mention those, but keeping them out of `facts` entirely means the model
 * is never even given a specific value it could get wrong).
 */
function buildFacts(icon: ChurchIconDto): string {
  const parts: string[] = [`Назва ікони: ${icon.title}`];
  if (icon.saintName) parts.push(`Святий/сюжет: ${icon.saintName}`);
  if (icon.feastName) parts.push(`Свято: ${icon.feastName}`);
  if (icon.description) parts.push(`Опис ікони: ${icon.description}`);
  if (icon.history) parts.push(`Історична довідка: ${icon.history}`);
  if (icon.saintImageDescription) parts.push(`Опис зображення на іконі: ${icon.saintImageDescription}`);
  if (icon.materials) parts.push(`Матеріали: ${icon.materials}`);
  if (icon.dimensions) parts.push(`Розміри: ${icon.dimensions}`);
  return parts.join('\n\n');
}

async function requireOpenAi() {
  const config = await getOpenAiConfig();
  if (!config) throw ApiError.validation('OpenAI is not configured');
  return config;
}

async function computeContent(
  product: ChurchProductDto,
  icon: ChurchIconDto,
  language: ProductAiLanguage,
  kind: ProductAiKind,
  openAi: { apiKey: string; model?: string }
): Promise<string> {
  const text = await generateProductContent({
    apiKey: openAi.apiKey,
    model: openAi.model,
    language,
    kind,
    productName: product[NAME_KEY[language]] || icon.title,
    facts: buildFacts(icon),
  });
  if (!checkContentLanguage(text, language, icon.saintName || icon.title).ok) {
    throw ApiError.validation('Виявлено текст іншою мовою (LANGUAGE_MISMATCH)');
  }
  return text;
}

async function runGenerate(
  id: string,
  language: ProductAiLanguage,
  kind: ProductAiKind,
  context: ProductAiActionContext,
  overwrite: boolean
): Promise<ProductAiActionResult> {
  const product = await getProduct(id);
  if (!overwrite && currentValue(product, language, kind).trim()) {
    throw ApiError.conflict('Це поле вже заповнене -- скористайтеся регенерацією, щоб замінити текст.');
  }
  const icon = await requireLinkedIconFacts(product, language);
  const openAi = await requireOpenAi();
  const text = await computeContent(product, icon, language, kind, openAi);
  const fieldKey = FIELD_KEY[language][kind];
  const verb = overwrite ? 'Regenerate' : 'Generate';
  return writeOrPropose(product, { [fieldKey]: text }, context, `${verb}: ${KIND_LABELS[kind]} (${language}) (потребує розгляду адміністратора)`);
}

export async function generateProductFullDescription(id: string, language: ProductAiLanguage, context: ProductAiActionContext) {
  return runGenerate(id, language, 'fullDescription', context, false);
}
export async function regenerateProductFullDescription(id: string, language: ProductAiLanguage, context: ProductAiActionContext) {
  return runGenerate(id, language, 'fullDescription', context, true);
}
export async function generateProductSeoTitle(id: string, language: ProductAiLanguage, context: ProductAiActionContext) {
  return runGenerate(id, language, 'seoTitle', context, false);
}
export async function regenerateProductSeoTitle(id: string, language: ProductAiLanguage, context: ProductAiActionContext) {
  return runGenerate(id, language, 'seoTitle', context, true);
}
export async function generateProductSeoDescription(id: string, language: ProductAiLanguage, context: ProductAiActionContext) {
  return runGenerate(id, language, 'seoDescription', context, false);
}
export async function regenerateProductSeoDescription(id: string, language: ProductAiLanguage, context: ProductAiActionContext) {
  return runGenerate(id, language, 'seoDescription', context, true);
}

// ---------------------------------------------------------------------------
// Fill missing -- fills whichever of the 9 (language x kind) fields are
// still empty, across all three languages in one call, never overwriting
// anything already filled. Refuses outright if there is no linked icon at
// all (nothing anywhere to generate from).
// ---------------------------------------------------------------------------

export type FillMissingProductSkip = { field: ProductTextField; reason: 'failed' };
export type FillMissingProductResult =
  | { mode: 'direct'; product: ChurchProductDto; filled: ProductTextField[]; skipped: FillMissingProductSkip[] }
  | { mode: 'proposal'; product: ChurchProductDto; proposalId: string | null; proposedFields: ProductTextField[]; skipped: FillMissingProductSkip[] };

export async function fillMissingProductContent(id: string, context: ProductAiActionContext): Promise<FillMissingProductResult> {
  const product = await getProduct(id);
  if (!product.linkedIconTranslationGroupId) {
    throw ApiError.validation("Цей товар не пов'язаний з жодною іконою -- AI не має фактів для генерації.");
  }
  const openAi = await requireOpenAi();

  const patch: Record<string, unknown> = {};
  const filled: ProductTextField[] = [];
  const skipped: FillMissingProductSkip[] = [];

  for (const language of ['uk', 'ru', 'en'] as const) {
    let icon: ChurchIconDto;
    try {
      icon = await requireLinkedIconFacts(product, language);
    } catch {
      for (const kind of KINDS) skipped.push({ field: FIELD_KEY[language][kind], reason: 'failed' });
      continue;
    }
    for (const kind of KINDS) {
      if (currentValue(product, language, kind).trim()) continue;
      const fieldKey = FIELD_KEY[language][kind];
      try {
        patch[fieldKey] = await computeContent(product, icon, language, kind, openAi);
        filled.push(fieldKey);
      } catch {
        skipped.push({ field: fieldKey, reason: 'failed' });
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return product.isActive
      ? { mode: 'proposal', product, proposalId: null, proposedFields: [], skipped }
      : { mode: 'direct', product, filled: [], skipped };
  }

  const result = await writeOrPropose(product, patch, context, 'Заповнити відсутнє з AI (потребує розгляду адміністратора)');
  return result.mode === 'direct'
    ? { mode: 'direct', product: result.product, filled, skipped }
    : { mode: 'proposal', product: result.product, proposalId: result.proposalId, proposedFields: filled, skipped };
}
