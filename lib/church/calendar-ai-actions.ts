import { describeSaintIconography, generateChurchContent } from '@/lib/ai/church-content';
import { checkUkrainianLanguage, describeLanguageGuardFailure } from '@/lib/ai/language-guard';
import { generateTelegramImage } from '@/lib/ai/openai-image';
import { getMediaBucket } from '@/lib/d1/env';
import { ApiError } from '@/lib/d1/errors';
import {
  getCalendarDay,
  updateCalendarDay,
  type CalendarImageMetadata,
  type ChurchCalendarDayDto,
} from '@/lib/d1/repositories/calendarDays';
import { listSaints, type ChurchSaintDto } from '@/lib/d1/repositories/saints';
import { lookupVerifiedSaintReference } from '@/lib/church/saint-reference';
import { IMAGE_HOUSE_STYLE } from '@/lib/telegram/content-format';
import { getOpenAiConfig } from '@/lib/telegram/env';
import { generateMediaKey } from '@/lib/media/keys';
import { verifySaintOfDay } from '@/lib/telegram/orthodox-calendar-verifier';

/**
 * AI preparation actions for the "Церковний календар" editor -- the
 * canonical CMS side of the architecture (see content-plan-actions.ts for
 * the Telegram/distribution-side equivalent, which this module is
 * deliberately parallel to). Every action here:
 *  - never invents the day's date, saint/feast identity, or Gospel reading
 *    -- those are canonical inputs, read but never altered;
 *  - refuses to run factual generation when there's a specific named
 *    saint/feast claim that fails the same two-source verification the
 *    Telegram pipeline already requires (see checkCalendarSource());
 *  - never overwrites a field that already has content (use the paired
 *    regenerate* action for that, an explicit choice with its own
 *    confirmation in the UI);
 *  - saves as DRAFT only -- `status` is never touched by any action here,
 *    so nothing this module does can publish the website;
 *  - never calls Telegram, never touches telegram_posts.
 */

/**
 * LAST-RESORT fallback only (task: "generic fallback должен быть LAST
 * RESORT") -- used exclusively when the day has no linked saint at all, or
 * a linked saint's identity could not be reliably confirmed via Wikipedia
 * (see lookupVerifiedSaintReference()). Brighter and more detailed than
 * the near-black version this replaces (task: "сделать изображение светлее
 * и визуально качественніше"), but still deliberately depicts no human
 * figure at all -- unlike SAINT_ILLUSTRATION_STYLE below, which is only
 * ever used once a specific identity has actually been verified.
 */
const CALENDAR_IMAGE_PROMPT =
  `${IMAGE_HOUSE_STYLE} Сюжет: світлий, наповнений теплим денним світлом інтер'єр православного храму -- сонячне проміння через ` +
  'вікна, начищена лампада, кілька запалених свічок з м’яким сяйвом, розгорнуте Євангеліє на аналої, деталізований іконостас ' +
  'удалині у м’якому золотому світлі, чисті глибокі кольори. Високий рівень деталізації, кінематографічна якість. ' +
  'КАТЕГОРИЧНО ЗАБОРОНЕНО: не малювати портрет чи обличчя жодного конкретного святого, не створювати псевдоікону з іменем чи ' +
  'впізнаваними рисами конкретної людини -- лише узагальнена атмосфера храму, без жодної впізнаваної людської постаті.';

/**
 * Used ONLY after a specific saint identity has been positively verified
 * (see lookupVerifiedSaintReference()) -- an explicit AI illustration, not
 * a claim to be an icon (task: "AI результат НЕ називати 'канонічна
 * ікона'"). `iconographyNotes` is either a vision-derived description of
 * the verified Wikipedia reference image's characteristics (clothing,
 * hair/beard, attributes) or, if that step failed/was unavailable, left
 * empty -- in which case the model draws only on the saint's name and
 * already-known local facts, still never a copy of any specific artwork.
 */
function buildSaintIllustrationPrompt(saintName: string, iconographyNotes: string | null): string {
  const referenceLine = iconographyNotes
    ? `Орієнтовні іконографічні риси цього святого (спирайся лише на це як на загальний орієнтир, не копіюй жодне конкретне зображення): ${iconographyNotes}. `
    : '';
  return (
    `${IMAGE_HOUSE_STYLE} Це НОВА, самостійна ілюстрація святого на ім'я "${saintName}" у традиційній православній візуальній мові -- ` +
    'шанобливий, реалістичний живописний стиль, детальне обличчя, природна шкіра, деталізоване вбрання, стримані золоті акценти, ' +
    "м'яке храмове освітлення, висока деталізація, чиста композиція. Святий -- явний головний об'єкт зображення, погруддя або поясний портрет. " +
    referenceLine +
    'НЕ відтворюй рамку, напис, підпис, пошкодження, водяний знак чи музейну етикетку жодного конкретного історичного зображення -- ' +
    'лише нова ілюстрація, натхненна загальною іконографічною традицією.'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

async function loadLinkedSaint(dayId: string): Promise<ChurchSaintDto | null> {
  const saints = await listSaints({});
  return saints.find((saint) => saint.calendarDayId === dayId) ?? null;
}

type SourceCheck = { ok: true; verified: boolean } | { ok: false; issue: 'missing_source' | 'review_required'; reason?: string };

/**
 * Gates factual AI generation on a two-source verification, exactly like
 * the Telegram pipeline's saint_of_day requirement (see
 * lib/telegram/orthodox-calendar-verifier.ts) -- but only when this day
 * actually carries a specific named-saint claim (a linked church_saints
 * row). A plain civil/liturgical/fast day with no linked saint has no
 * "identity" a source could fail to verify, so AI may elaborate on its own
 * existing title/description/history without this gate.
 */
async function checkCalendarSource(day: ChurchCalendarDayDto, saint: ChurchSaintDto | null): Promise<SourceCheck> {
  if (!saint) return { ok: true, verified: false };
  if (!day.dateOldStyle) return { ok: false, issue: 'review_required', reason: 'no old-style date to verify against' };

  const civilDateIso = day.dateNewStyle ?? day.dateOldStyle;
  const verification = await verifySaintOfDay({ civilDateIso, julianDateIso: day.dateOldStyle, candidateName: saint.name });
  if (!verification.verified) return { ok: false, issue: 'review_required', reason: verification.reason };
  return { ok: true, verified: true };
}

function buildFacts(day: ChurchCalendarDayDto, saint: ChurchSaintDto | null): string {
  const parts: string[] = [];
  if (saint) {
    parts.push(`Святий/свято: ${saint.name}`);
    if (saint.shortDescription) parts.push(`Короткий опис святого: ${saint.shortDescription}`);
    if (saint.biography) parts.push(`Житіє святого: ${saint.biography}`);
  }
  if (day.description) parts.push(`Наявний короткий опис дня: ${day.description}`);
  if (day.history) parts.push(`Наявна історична довідка: ${day.history}`);
  if (parts.length === 0) parts.push(`Назва дня: ${day.title}`);
  return parts.join('\n\n');
}

async function requireSourceOk(day: ChurchCalendarDayDto): Promise<{ saint: ChurchSaintDto | null; verified: boolean }> {
  const saint = await loadLinkedSaint(day.id);
  const check = await checkCalendarSource(day, saint);
  if (!check.ok) {
    const marker = check.issue === 'missing_source' ? 'MISSING_SOURCE' : 'REVIEW_REQUIRED';
    throw ApiError.validation(`cannot generate factual content: ${check.reason ?? check.issue} (${marker})`);
  }
  return { saint, verified: check.verified };
}

async function requireOpenAi() {
  const config = await getOpenAiConfig();
  if (!config) throw ApiError.validation('OpenAI is not configured');
  return config;
}

/** Same shared guard as the Telegram pipeline's content-plan-actions.ts
 * (task: "не создавать две разные реализации проверки языка") -- checked
 * right after every generateChurchContent() call, before it's ever
 * persisted via updateCalendarDay(). A failure here throws, so the
 * offending field is never written to the public-facing calendar day. */
function assertUkrainianOrThrow(text: string): void {
  const check = checkUkrainianLanguage(text);
  if (!check.ok) throw ApiError.validation(describeLanguageGuardFailure(check));
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

export async function generateCalendarDescription(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  if (day.description.trim()) throw ApiError.conflict('this day already has a description -- use regenerate to replace it');
  return regenerateCalendarDescription(dayId);
}

export async function regenerateCalendarDescription(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  const { saint, verified } = await requireSourceOk(day);
  const openAi = await requireOpenAi();
  const description = await generateChurchContent({
    apiKey: openAi.apiKey,
    model: openAi.model,
    kind: 'description',
    civilDateIso: day.dateNewStyle,
    julianDateIso: day.dateOldStyle,
    title: day.title,
    facts: buildFacts(day, saint),
    verified,
  });
  assertUkrainianOrThrow(description);
  return updateCalendarDay(dayId, { description });
}

// ---------------------------------------------------------------------------
// History / full text
// ---------------------------------------------------------------------------

export async function generateCalendarHistory(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  if (day.history.trim()) throw ApiError.conflict('this day already has history text -- use regenerate to replace it');
  return regenerateCalendarHistory(dayId);
}

export async function regenerateCalendarHistory(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  const { saint, verified } = await requireSourceOk(day);
  const openAi = await requireOpenAi();
  const history = await generateChurchContent({
    apiKey: openAi.apiKey,
    model: openAi.model,
    kind: 'history',
    civilDateIso: day.dateNewStyle,
    julianDateIso: day.dateOldStyle,
    title: day.title,
    facts: buildFacts(day, saint),
    verified,
  });
  assertUkrainianOrThrow(history);
  return updateCalendarDay(dayId, { history });
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

/** Fills only whichever of seoTitle/seoDescription is currently empty --
 * refuses outright only if BOTH already have content (use regenerate). */
export async function generateCalendarSeo(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  if (day.seoTitle?.trim() && day.seoDescription?.trim()) {
    throw ApiError.conflict('this day already has SEO title and description -- use regenerate to replace them');
  }
  const { saint, verified } = await requireSourceOk(day);
  const openAi = await requireOpenAi();
  const base = { apiKey: openAi.apiKey, model: openAi.model, civilDateIso: day.dateNewStyle, julianDateIso: day.dateOldStyle, title: day.title, facts: buildFacts(day, saint), verified };

  let seoTitle = day.seoTitle?.trim() ? day.seoTitle : null;
  if (!seoTitle) {
    seoTitle = await generateChurchContent({ ...base, kind: 'seo_title' });
    assertUkrainianOrThrow(seoTitle);
  }
  let seoDescription = day.seoDescription?.trim() ? day.seoDescription : null;
  if (!seoDescription) {
    seoDescription = await generateChurchContent({ ...base, kind: 'seo_description' });
    assertUkrainianOrThrow(seoDescription);
  }
  return updateCalendarDay(dayId, { seoTitle, seoDescription });
}

/** Always overwrites both fields. */
export async function regenerateCalendarSeo(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  const { saint, verified } = await requireSourceOk(day);
  const openAi = await requireOpenAi();
  const base = { apiKey: openAi.apiKey, model: openAi.model, civilDateIso: day.dateNewStyle, julianDateIso: day.dateOldStyle, title: day.title, facts: buildFacts(day, saint), verified };

  const [seoTitle, seoDescription] = await Promise.all([
    generateChurchContent({ ...base, kind: 'seo_title' }),
    generateChurchContent({ ...base, kind: 'seo_description' }),
  ]);
  assertUkrainianOrThrow(seoTitle);
  assertUkrainianOrThrow(seoDescription);
  return updateCalendarDay(dayId, { seoTitle, seoDescription });
}

// ---------------------------------------------------------------------------
// Image -- priority chain (task section 2):
//   1) existing verified local saint/icon image
//   2) Wikipedia/Wikimedia identification + reference
//   3) AI-generated saint illustration informed by that verified reference
//   4) generic thematic fallback, ONLY when the saint can't be reliably
//      identified -- last resort, never the default.
// ---------------------------------------------------------------------------

async function storeGeneratedImage(dayId: string, image: { bytes: ArrayBuffer; mimeType: string }): Promise<string> {
  const key = generateMediaKey({ module: 'calendar', entityId: dayId, purpose: 'main', mimeType: image.mimeType });
  const bucket = await getMediaBucket();
  const putResult = await bucket.put(key, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { module: 'calendar', entityId: dayId, purpose: 'main' },
  });
  if (!putResult) throw new Error(`R2 put() returned no result for key ${key}`);
  return key;
}

type ResolvedImage = { imageUrl: string; imageMetadata: CalendarImageMetadata | null };

/**
 * Steps 2+3 of the priority chain: looks up and verifies a Wikipedia
 * identity for `saint`, and if one is found, generates a NEW illustration
 * informed by it (never a copy -- see buildSaintIllustrationPrompt's own
 * doc comment). Falls back to the generic thematic image (step 4) the
 * moment any part of this is uncertain: no saint at all, no reliable
 * Wikipedia match, or the vision-description step failing -- this
 * function never throws for those cases, only for the final image
 * generation/upload actually failing outright.
 *
 * `existingReference` lets regenerateCalendarImage() reuse an
 * already-verified identity without repeating the Wikipedia lookup (task:
 * "Regenerate... не выполнять заново полный lookup без необходимости").
 */
async function resolveSaintIllustration(
  dayId: string,
  saint: ChurchSaintDto | null,
  openAi: { apiKey: string; imageModel?: string; model?: string },
  existingReference?: CalendarImageMetadata,
): Promise<ResolvedImage> {
  const reused = existingReference?.identityVerified && existingReference.referenceImageUrl ? existingReference : undefined;
  let reference = reused;
  let fallbackReason: string | undefined;
  let referenceSource: 'reused' | 'lookup' | 'none' = reused ? 'reused' : 'none';

  if (!reference && saint) {
    const lookup = await lookupVerifiedSaintReference({
      name: saint.name,
      knownFacts: `${saint.shortDescription} ${saint.biography}`,
    });
    if (lookup.status === 'verified') {
      reference = {
        origin: 'ai_generated',
        referenceProvider: lookup.reference.sourceProvider,
        referenceLanguage: lookup.reference.sourceLanguage,
        referencePageUrl: lookup.reference.sourcePageUrl,
        referenceImageUrl: lookup.reference.sourceImageUrl,
        referenceTitle: lookup.reference.sourceTitle,
        referenceAuthor: lookup.reference.sourceAuthor,
        referenceLicense: lookup.reference.sourceLicense,
        referenceAttribution: lookup.reference.sourceAttribution,
        wikidataId: lookup.reference.wikidataId,
        commonsFileTitle: lookup.reference.commonsFileTitle,
        commonsCategory: lookup.reference.commonsCategory,
        identityVerified: true,
      };
      referenceSource = 'lookup';
    } else {
      fallbackReason = lookup.reason ?? lookup.status;
    }
  }

  /** One line per image resolution, correlating this specific calendar day
   * with the resolver's own [saint-reference] trace log above -- answers
   * "which day used which chain" without cross-referencing timestamps by
   * hand (task: "лог который отследит генерацию фото и поймём какая
   * цепочка работает правильно или нет"). */
  console.log(
    `[calendar-image] day=${dayId} saint="${saint?.name ?? ''}" source=${referenceSource} provider=${reference?.referenceProvider ?? ''} language=${reference?.referenceLanguage ?? ''} wikidataId=${reference?.wikidataId ?? ''} identityVerified=${Boolean(reference?.identityVerified)} fallbackReason="${fallbackReason ?? ''}"`,
  );

  if (reference && saint) {
    const iconographyNotes = await describeSaintIconography({
      apiKey: openAi.apiKey,
      model: openAi.model,
      imageUrl: reference.referenceImageUrl!,
      saintName: saint.name,
    }).catch(() => null);

    const image = await generateTelegramImage({
      apiKey: openAi.apiKey,
      model: openAi.imageModel,
      prompt: buildSaintIllustrationPrompt(saint.name, iconographyNotes),
    });
    const key = await storeGeneratedImage(dayId, image);
    return { imageUrl: key, imageMetadata: reference };
  }

  const image = await generateTelegramImage({ apiKey: openAi.apiKey, model: openAi.imageModel, prompt: CALENDAR_IMAGE_PROMPT });
  const key = await storeGeneratedImage(dayId, image);
  return { imageUrl: key, imageMetadata: { origin: 'ai_generated', identityVerified: false, fallbackReason } };
}

/** Priority order (task: "AI image safety"): 1) the linked saint's own
 * verified/source image (no AI, no Wikipedia lookup -- task section 9),
 * 2-4) resolveSaintIllustration()'s own chain. A manually-picked Media
 * Library image is handled by the separate assignCalendarImage() action,
 * not this one. */
export async function generateCalendarImage(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  if (day.imageUrl.trim()) throw ApiError.conflict('this day already has an image -- use regenerate to replace it');

  const saint = await loadLinkedSaint(dayId);
  if (saint?.imageUrl?.trim()) {
    return updateCalendarDay(dayId, { imageUrl: saint.imageUrl, imageMetadata: null });
  }
  const openAi = await requireOpenAi();
  const { imageUrl, imageMetadata } = await resolveSaintIllustration(dayId, saint, openAi);
  return updateCalendarDay(dayId, { imageUrl, imageMetadata });
}

/** Always attempts a fresh image; restores the previous one (and its
 * provenance metadata) if generation fails, mirroring
 * content-plan-actions.ts's regenerateSlotImage(). Reuses an already-
 * verified Wikipedia reference instead of re-querying it, per task
 * section 12. */
export async function regenerateCalendarImage(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  const previousImageUrl = day.imageUrl;
  const previousImageMetadata = day.imageMetadata;
  try {
    const saint = await loadLinkedSaint(dayId);
    if (saint?.imageUrl?.trim()) {
      return await updateCalendarDay(dayId, { imageUrl: saint.imageUrl, imageMetadata: null });
    }
    const openAi = await requireOpenAi();
    const { imageUrl, imageMetadata } = await resolveSaintIllustration(dayId, saint, openAi, previousImageMetadata ?? undefined);
    return await updateCalendarDay(dayId, { imageUrl, imageMetadata });
  } catch (error) {
    if (previousImageUrl) return updateCalendarDay(dayId, { imageUrl: previousImageUrl, imageMetadata: previousImageMetadata });
    throw new ApiError(500, 'IMAGE_GENERATION_ERROR', 'Image generation failed', errorMessage(error));
  }
}

/**
 * Admin-authored English prompt, bypassing lookupVerifiedSaintReference()
 * entirely -- an explicit escape hatch for exactly the case the automatic
 * chain exists to handle conservatively: when the resolver can't (yet)
 * find a reliable reference for a given saint, the admin can still get a
 * specific illustration by describing it directly (Media tab "Промпт для
 * AI"), instead of being stuck with the generic thematic fallback. Sent to
 * OpenAI verbatim, with no house-style prefix or other rewriting -- typing
 * a prompt is a deliberate, explicit request for exactly that image, the
 * same trust boundary "Обрати з медіатеки" already extends to admin input.
 * Always overwrites any existing image (like regenerate*, not generate*):
 * typing a new prompt and clicking this action is itself the explicit
 * intent to replace whatever is there, so there is no separate
 * "already has an image" guard to bypass.
 */
export async function generateCalendarImageFromPrompt(dayId: string, prompt: string): Promise<ChurchCalendarDayDto> {
  const trimmed = prompt.trim();
  if (!trimmed) throw ApiError.validation('prompt is required');

  const day = await getCalendarDay(dayId);
  const previousImageUrl = day.imageUrl;
  const previousImageMetadata = day.imageMetadata;
  const openAi = await requireOpenAi();
  try {
    const image = await generateTelegramImage({ apiKey: openAi.apiKey, model: openAi.imageModel, prompt: trimmed });
    const key = await storeGeneratedImage(dayId, image);
    console.log(`[calendar-image] day=${dayId} source=custom_prompt`);
    return await updateCalendarDay(dayId, {
      imageUrl: key,
      imageMetadata: { origin: 'ai_generated', identityVerified: false, customPrompt: trimmed },
    });
  } catch (error) {
    if (previousImageUrl) return updateCalendarDay(dayId, { imageUrl: previousImageUrl, imageMetadata: previousImageMetadata });
    throw new ApiError(500, 'IMAGE_GENERATION_ERROR', 'Image generation failed', errorMessage(error));
  }
}

/** "Обрати з медіатеки" -- persists an already-uploaded R2 key/URL
 * directly, no AI call. Clears any previous AI provenance metadata: this
 * image is now a manual pick, and must never be displayed as AI-generated
 * (task: "AI result marked AI-generated" -- the inverse must hold too). */
export async function assignCalendarImage(dayId: string, imageUrl: string): Promise<ChurchCalendarDayDto> {
  return updateCalendarDay(dayId, { imageUrl, imageMetadata: null });
}

// ---------------------------------------------------------------------------
// Fill missing -- the orchestration layer, mirroring
// content-plan-actions.ts's prepareContentPlanDay() for the calendar side.
// ---------------------------------------------------------------------------

export type FillMissingCalendarField = 'description' | 'history' | 'seo' | 'image';
export type FillMissingCalendarResult = {
  day: ChurchCalendarDayDto;
  filled: FillMissingCalendarField[];
  skipped: { field: FillMissingCalendarField; reason: 'missing_source' | 'review_required' | 'failed' }[];
};

/**
 * "Заповнити відсутнє з AI" -- fills only whichever of description/
 * history/SEO/image is currently empty; never overwrites existing content
 * (manual or AI-generated); never changes `status`; never publishes; never
 * touches Telegram. A verification failure or missing source for this
 * day's saint claim skips ALL factual fields (description/history/SEO all
 * depend on the same facts) but still attempts the image step's saint-
 * image priority check (image safety doesn't depend on the same gate --
 * see generateCalendarImage's own priority order).
 */
export async function fillMissingCalendarContent(dayId: string): Promise<FillMissingCalendarResult> {
  let day = await getCalendarDay(dayId);
  const filled: FillMissingCalendarField[] = [];
  const skipped: FillMissingCalendarResult['skipped'] = [];

  const saint = await loadLinkedSaint(dayId);
  const sourceCheck = await checkCalendarSource(day, saint);

  if (!sourceCheck.ok) {
    if (!day.description.trim()) skipped.push({ field: 'description', reason: sourceCheck.issue });
    if (!day.history.trim()) skipped.push({ field: 'history', reason: sourceCheck.issue });
    if (!(day.seoTitle?.trim() && day.seoDescription?.trim())) skipped.push({ field: 'seo', reason: sourceCheck.issue });
  } else {
    if (!day.description.trim()) {
      try {
        day = await regenerateCalendarDescription(dayId);
        filled.push('description');
      } catch {
        skipped.push({ field: 'description', reason: 'failed' });
      }
    }
    if (!day.history.trim()) {
      try {
        day = await regenerateCalendarHistory(dayId);
        filled.push('history');
      } catch {
        skipped.push({ field: 'history', reason: 'failed' });
      }
    }
    if (!(day.seoTitle?.trim() && day.seoDescription?.trim())) {
      try {
        day = await generateCalendarSeo(dayId);
        filled.push('seo');
      } catch {
        skipped.push({ field: 'seo', reason: 'failed' });
      }
    }
  }

  if (!day.imageUrl.trim()) {
    try {
      day = await generateCalendarImage(dayId);
      filled.push('image');
    } catch {
      skipped.push({ field: 'image', reason: 'failed' });
    }
  }

  return { day, filled, skipped };
}
