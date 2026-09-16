import { editIconImage } from '@/lib/ai/icon-image-edit';
import { ApiError } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { getIcon, type ChurchIconDto, type IconGalleryMetadata } from '@/lib/d1/repositories/icons';
import { generateMediaKey, validateMediaKey } from '@/lib/media/keys';
import { assertAutomaticEditAllowed, requireOpenAi, writeOrPropose, type IconAiActionContext, type IconAiActionResult } from './icon-ai-actions';

/**
 * Portfolio/lifestyle photo generation from an icon's existing uploaded
 * photo -- deliberately split into two actions:
 *
 *  - generateIconPortfolio() only ever READS the icon and its source
 *    photo, and WRITES new objects to R2 under the 'portfolio' media
 *    purpose (see lib/media/constants.ts). It never touches the
 *    church_icons row -- the candidates it returns are not part of the
 *    icon's public media yet, satisfying "generated results must be
 *    reviewable before becoming part of the icon's public media" and
 *    "published icons must not be silently mutated" by construction: there
 *    is no icon-row write for a published icon to silently receive.
 *  - addIconPortfolioImages() is the explicit admin confirm step -- it
 *    takes a set of previously-generated candidates the admin chose to
 *    keep and merges them into the icon's gallery via the SAME
 *    writeOrPropose() routing every other icon AI action already uses
 *    (draft writes directly, published becomes a human-authored proposal
 *    for review, never an automatic silent mutation).
 *
 * The icon's own `imageUrl` (the main/original photo) is never read for
 * writing and never appears on either action's write path -- only as the
 * READ-ONLY source image bytes fed into the image-edit call. Every
 * generated photo becomes a brand-new R2 object at a brand-new key; there
 * is no code path in this module capable of overwriting `imageUrl` or an
 * existing gallery entry.
 */

export type PortfolioPreset = 'table_candle' | 'in_hand' | 'framed_wall';

const PORTFOLIO_PRESETS: readonly { key: PortfolioPreset; prompt: string }[] = [
  {
    key: 'table_candle',
    prompt:
      "Place this exact icon photo standing on a wooden table beside a single lit candle, warm ambient lighting, shallow depth of field, styled as a product lifestyle photo for an online church icon shop. Keep the icon itself -- its image, colors, proportions and every detail -- completely unchanged; only add the surrounding table-and-candle scene around it.",
  },
  {
    key: 'in_hand',
    prompt:
      "Show this exact icon photo being held in a person's hands at chest height, soft natural window light, styled as a product lifestyle photo for an online church icon shop. Keep the icon itself -- its image, colors, proportions and every detail -- completely unchanged; only add the hands holding it and the surrounding scene.",
  },
  {
    key: 'framed_wall',
    prompt:
      'Show this exact icon photo framed in a simple wooden frame and hanging on a plain light-colored interior wall, soft daylight, styled as a product lifestyle photo for an online church icon shop. Keep the icon itself -- its image, colors, proportions and every detail -- completely unchanged; only add the frame and wall setting around it.',
  },
];

export type GeneratedPortfolioPhoto = {
  preset: PortfolioPreset;
  /** New R2 key under media/icons/{iconId}/portfolio/ -- never the icon's
   * own imageUrl or an existing gallery entry. */
  imageUrl: string;
  /** The icon's main photo key AT GENERATION TIME, for provenance --
   * mirrors IconGalleryImageMetadata.sourceImageUrl exactly. */
  sourceImageUrl: string;
  generatedAt: string;
};
export type PortfolioGenerationSkip = { preset: PortfolioPreset; reason: 'failed' };
export type GenerateIconPortfolioResult = {
  icon: ChurchIconDto;
  generated: GeneratedPortfolioPhoto[];
  skipped: PortfolioGenerationSkip[];
};

/**
 * Generates one candidate photo per preset from the icon's own source
 * photo and stores each as a new R2 object -- no church_icons row is read
 * for writing or written to. Requires an existing, valid source photo
 * (task: "require an existing source image"); refuses outright if the
 * icon has none, rather than falling back to a from-scratch generation
 * that could reinvent the depicted saint. Partial-failure tolerant like
 * fillMissingIconContent(): a single preset failing does not block the
 * others.
 */
export async function generateIconPortfolio(iconId: string): Promise<GenerateIconPortfolioResult> {
  const icon = await getIcon(iconId);
  if (!icon.imageUrl.trim())
    throw ApiError.validation('This icon has no source photo yet -- upload one before generating a portfolio.');
  if (!validateMediaKey(icon.imageUrl))
    throw ApiError.validation("This icon's photo is not stored in the media library and cannot be used as a source.");

  const bucket = await getMediaBucket();
  const sourceObject = await bucket.get(icon.imageUrl);
  if (!sourceObject) throw ApiError.validation("The icon's source photo could not be found in storage.");
  const sourceImageBytes = await sourceObject.arrayBuffer();
  const sourceImageMimeType = sourceObject.httpMetadata?.contentType ?? 'image/png';

  const openAi = await requireOpenAi();
  const sourceImageUrl = icon.imageUrl;
  const generatedAt = new Date().toISOString();

  const generated: GeneratedPortfolioPhoto[] = [];
  const skipped: PortfolioGenerationSkip[] = [];

  for (const preset of PORTFOLIO_PRESETS) {
    try {
      const image = await editIconImage({
        apiKey: openAi.apiKey,
        model: openAi.imageModel,
        sourceImageBytes,
        sourceImageMimeType,
        prompt: preset.prompt,
      });
      const key = generateMediaKey({ module: 'icons', entityId: iconId, purpose: 'portfolio', mimeType: image.mimeType });
      const putResult = await bucket.put(key, image.bytes, {
        httpMetadata: { contentType: image.mimeType },
        customMetadata: { module: 'icons', entityId: iconId, purpose: 'portfolio' },
      });
      if (!putResult) throw new Error(`R2 put() returned no result for key ${key}`);
      generated.push({ preset: preset.key, imageUrl: key, sourceImageUrl, generatedAt });
    } catch {
      skipped.push({ preset: preset.key, reason: 'failed' });
    }
  }

  return { icon, generated, skipped };
}

function isOwnPortfolioKey(iconId: string, key: string): boolean {
  return validateMediaKey(key) && key.startsWith(`media/icons/${iconId}/portfolio/`);
}

const PRESET_KEYS = new Set<string>(PORTFOLIO_PRESETS.map((preset) => preset.key));

/**
 * Validates the FULL shape of an admin-submitted entry, not just its
 * imageUrl -- this body reaches addIconPortfolioImages() straight from the
 * request, and a DRAFT icon's write goes directly to updateIcon() without
 * ever passing through lib/ai-access/proposals.ts's patchFor()/
 * isValidIconGalleryMetadata() (that validator only runs on the PUBLISHED/
 * proposal path), so this is the only gate a malformed body meets on the
 * draft path.
 */
function isWellFormedPortfolioEntry(entry: GeneratedPortfolioPhoto): boolean {
  return (
    typeof entry.preset === 'string' &&
    PRESET_KEYS.has(entry.preset) &&
    typeof entry.sourceImageUrl === 'string' &&
    validateMediaKey(entry.sourceImageUrl) &&
    typeof entry.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(entry.generatedAt))
  );
}

/**
 * The explicit confirm step -- merges admin-selected, previously-generated
 * candidates into the icon's gallery. Re-validates that every provided
 * key genuinely belongs to THIS icon's own portfolio namespace (task:
 * "generated assets stay linked to the correct icon") rather than trusting
 * the request body, so a forged/mismatched URL claiming to be a
 * legitimately-generated portfolio photo for a different icon (or
 * anything outside the portfolio namespace entirely) is rejected instead
 * of silently entering the gallery. Routes through the exact same
 * writeOrPropose() draft-direct/published-proposal policy as every other
 * icon AI action.
 */
export async function addIconPortfolioImages(
  iconId: string,
  entries: GeneratedPortfolioPhoto[],
  context: IconAiActionContext
): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  assertAutomaticEditAllowed(icon);
  if (!entries.length) throw ApiError.validation('No images to add.');

  for (const entry of entries) {
    if (!isOwnPortfolioKey(iconId, entry.imageUrl))
      throw ApiError.validation('One of the provided images does not belong to this icon.');
    if (!isWellFormedPortfolioEntry(entry)) throw ApiError.validation('One of the provided images has invalid metadata.');
  }

  const galleryUrls = [...icon.galleryUrls];
  const galleryMetadata: IconGalleryMetadata = { ...icon.galleryMetadata };
  for (const entry of entries) {
    if (!galleryUrls.includes(entry.imageUrl)) galleryUrls.push(entry.imageUrl);
    galleryMetadata[entry.imageUrl] = {
      origin: 'ai_generated_portfolio',
      sourceImageUrl: entry.sourceImageUrl,
      preset: entry.preset,
      generatedAt: entry.generatedAt,
    };
  }

  return writeOrPropose(icon, { galleryUrls, galleryMetadata }, context, 'Додати AI-портфоліо фото до галереї (потребує розгляду адміністратора)');
}
