import { generateChurchContent } from '@/lib/ai/church-content';
import { generateTelegramImage } from '@/lib/ai/openai-image';
import { getMediaBucket } from '@/lib/d1/env';
import { ApiError } from '@/lib/d1/errors';
import { getCalendarDay, updateCalendarDay, type ChurchCalendarDayDto } from '@/lib/d1/repositories/calendarDays';
import { listSaints, type ChurchSaintDto } from '@/lib/d1/repositories/saints';
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

const CALENDAR_IMAGE_PROMPT =
  `${IMAGE_HOUSE_STYLE} Сюжет: інтер'єр православного храму -- лампада, запалені свічки, ` +
  'закрите Євангеліє на аналої, іконостас удалині у м’якому золотому світлі. ' +
  'КАТЕГОРИЧНО ЗАБОРОНЕНО: не малювати портрет чи обличчя жодного конкретного святого, не створювати псевдоікону з іменем чи ' +
  'впізнаваними рисами конкретної людини -- лише узагальнена атмосфера храму, без жодної впізнаваної людської постаті.';

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

  const seoTitle = day.seoTitle?.trim() ? day.seoTitle : await generateChurchContent({ ...base, kind: 'seo_title' });
  const seoDescription = day.seoDescription?.trim() ? day.seoDescription : await generateChurchContent({ ...base, kind: 'seo_description' });
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
  return updateCalendarDay(dayId, { seoTitle, seoDescription });
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

async function generateAndStoreImage(dayId: string): Promise<string> {
  const openAi = await requireOpenAi();
  const image = await generateTelegramImage({ apiKey: openAi.apiKey, model: openAi.imageModel, prompt: CALENDAR_IMAGE_PROMPT });
  const key = generateMediaKey({ module: 'calendar', entityId: dayId, purpose: 'main', mimeType: image.mimeType });
  const bucket = await getMediaBucket();
  const putResult = await bucket.put(key, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { module: 'calendar', entityId: dayId, purpose: 'main' },
  });
  if (!putResult) throw new Error(`R2 put() returned no result for key ${key}`);
  return key;
}

/** Priority order (task: "AI image safety"): 1) the linked saint's own
 * verified/source image, 2) a safe AI thematic fallback -- never a portrait
 * of a specific saint. A manually-picked Media Library image is handled by
 * the separate assignCalendarImage() action, not this one. */
export async function generateCalendarImage(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  if (day.imageUrl.trim()) throw ApiError.conflict('this day already has an image -- use regenerate to replace it');

  const saint = await loadLinkedSaint(dayId);
  if (saint?.imageUrl?.trim()) {
    return updateCalendarDay(dayId, { imageUrl: saint.imageUrl });
  }
  const key = await generateAndStoreImage(dayId);
  return updateCalendarDay(dayId, { imageUrl: key });
}

/** Always attempts a fresh image; restores the previous one if generation
 * fails, mirroring content-plan-actions.ts's regenerateSlotImage(). */
export async function regenerateCalendarImage(dayId: string): Promise<ChurchCalendarDayDto> {
  const day = await getCalendarDay(dayId);
  const previousImageUrl = day.imageUrl;
  try {
    const saint = await loadLinkedSaint(dayId);
    const imageUrl = saint?.imageUrl?.trim() ? saint.imageUrl : await generateAndStoreImage(dayId);
    return await updateCalendarDay(dayId, { imageUrl });
  } catch (error) {
    if (previousImageUrl) return updateCalendarDay(dayId, { imageUrl: previousImageUrl });
    throw new ApiError(500, 'IMAGE_GENERATION_ERROR', 'Image generation failed', errorMessage(error));
  }
}

/** "Обрати з медіатеки" -- persists an already-uploaded R2 key/URL
 * directly, no AI call. */
export async function assignCalendarImage(dayId: string, imageUrl: string): Promise<ChurchCalendarDayDto> {
  return updateCalendarDay(dayId, { imageUrl });
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
