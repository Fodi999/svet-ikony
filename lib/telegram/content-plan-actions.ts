import { generateTelegramPost } from '@/lib/ai/openai';
import { ApiError } from '@/lib/d1/errors';
import { getTelegramPost, type TelegramPostDto } from '@/lib/d1/repositories/telegram';
import {
  findOrCreatePreparedSlot,
  findTelegramPostBySlot,
  isAutopostContentType,
  setAutopostImageResult,
  setAutopostSlotReady,
  setAutopostSlotUnready,
  setAutopostVerificationResult,
  setPreparedPostText,
  type AutopostContentType,
} from '@/lib/d1/repositories/telegram-autopost';
import { loadAutopostFacts, type AutopostFacts } from './autopost-content';
import { ensureAutopostImage } from './autopost-image';
import { getOrResolveChannelChat } from './channel';
import { TelegramClient } from './client';
import { buildSaintOfDayTitle, CONTENT_TYPE_FORMAT_HINTS, CONTENT_TYPE_LABELS, CONTENT_TYPE_TARGET_LENGTH, CONTENT_TYPE_TITLES } from './content-format';
import { getOpenAiConfig, getTelegramConfig } from './env';
import { gregorianToJulianCalendarDate } from './julian-calendar';
import { verifySaintOfDay } from './orthodox-calendar-verifier';
import { requiresCalendarVerification, validateBeforeSend } from './pre-send-validator';

/**
 * Content Plan Stage 2 -- one-slot-at-a-time admin preparation actions
 * (generate/regenerate text, generate/regenerate/assign an image, manual
 * edit, mark ready/unready). Deliberately separate from the read-only
 * lib/telegram/content-plan.ts (never imported by it, so that module's own
 * "no write path" test keeps meaning something) and from lib/telegram/
 * autopost.ts (the live tick never imports this file either -- the only
 * connection between the two is data: a row this file marks 'ready' is
 * what claimReadyAutopostSlot() in telegram-autopost.ts later picks up).
 *
 * Every action here: never calls Telegram, never sends anything, and only
 * calls OpenAI/generates an image when explicitly asked (generate/
 * regenerate) -- a plain view, edit, or mark-ready/unready never touches
 * either. A `sent` (or `sending` -- mid-flight autopost) row is rejected
 * by every mutating action before anything else happens.
 */

function requireContentType(value: string): AutopostContentType {
  if (!isAutopostContentType(value)) throw ApiError.validation(`unknown content type: ${value}`);
  return value;
}

function assertMutable(post: TelegramPostDto): void {
  if (post.status === 'sent' || post.status === 'sending') {
    throw ApiError.conflict('this slot has already been sent and can no longer be changed');
  }
}

async function resolveChannelChatId(): Promise<number> {
  const telegramConfig = await getTelegramConfig();
  if (!telegramConfig) throw ApiError.validation('Telegram bot is not configured');
  const client = new TelegramClient(telegramConfig.botToken);
  const channelChat = await getOrResolveChannelChat(client, telegramConfig.channel);
  return channelChat.telegramChatId;
}

/**
 * Loads source facts for this slot and, for content types that require it
 * (saint_of_day), runs and persists calendar verification -- fails closed
 * exactly like the autopost tick: missing/insufficient source or a failed
 * verification throws before OpenAI is ever reached, and a verification
 * result is only persisted once a `telegram_posts` row exists to attach it
 * to. Shared by generateSlotText/regenerateSlotText/generateSlotImage/
 * regenerateSlotImage, since image generation also needs
 * `facts.verifiedImageUrl` and must not skip the verification gate either.
 */
async function loadVerifiedFactsOrThrow(
  civilDateIso: string,
  contentType: AutopostContentType
): Promise<{ facts: AutopostFacts; verifiedFacts: boolean; verify: (postId: number) => Promise<void> }> {
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const factsResult = await loadAutopostFacts(contentType, julianDateIso);
  if (factsResult.status === 'missing_source') {
    throw ApiError.validation('no calendar day / source data exists for this date (MISSING_SOURCE)');
  }
  if (factsResult.status === 'insufficient_data') {
    throw ApiError.validation('this content type has no matching source row for this date (MISSING_SOURCE)');
  }
  const { facts } = factsResult;

  if (!requiresCalendarVerification(contentType)) {
    return { facts, verifiedFacts: false, verify: async () => {} };
  }

  const verification = await verifySaintOfDay({ civilDateIso, julianDateIso, candidateName: facts.candidateName ?? '' });
  const checkedAt = new Date().toISOString();
  const verify = async (postId: number) => {
    await setAutopostVerificationResult(postId, {
      status: verification.verified ? 'verified' : 'failed',
      checkedAt,
      sources: verification.sources,
      error: verification.verified ? null : verification.reason,
    });
  };
  if (!verification.verified) {
    // Still persisted (via the caller, once a row exists) so the failure
    // is visible in the Content Plan drawer -- but thrown here before any
    // row is created for a slot that had none yet, matching "REVIEW_REQUIRED
    // -> reject, never write a confident draft".
    throw ApiError.validation(`calendar verification failed: ${verification.reason} (REVIEW_REQUIRED)`);
  }
  return { facts, verifiedFacts: true, verify };
}

async function resolveOrCreateSlot(civilDateIso: string, contentType: AutopostContentType, facts: AutopostFacts): Promise<TelegramPostDto> {
  const channelChatId = await resolveChannelChatId();
  return findOrCreatePreparedSlot({
    contentType,
    publishDate: civilDateIso,
    channelChatId,
    sourceType: facts.sourceType,
    sourceId: facts.sourceId,
  });
}

async function buildText(
  contentType: AutopostContentType,
  facts: AutopostFacts,
  civilDateIso: string,
  julianDateIso: string,
  verifiedFacts: boolean
): Promise<string> {
  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) throw ApiError.validation('OpenAI is not configured');
  const targetLength = CONTENT_TYPE_TARGET_LENGTH[contentType];
  return generateTelegramPost({
    apiKey: openAiConfig.apiKey,
    model: openAiConfig.model,
    contentTypeLabel: CONTENT_TYPE_LABELS[contentType],
    formatHint: CONTENT_TYPE_FORMAT_HINTS[contentType],
    targetLengthMin: targetLength.min,
    targetLengthMax: targetLength.max,
    facts: facts.facts,
    civilDateIso,
    julianDateIso,
    verifiedFacts,
    titleLine: contentType === 'saint_of_day' ? buildSaintOfDayTitle(facts.candidateName ?? '') : CONTENT_TYPE_TITLES[contentType],
    titleFlexible: contentType === 'faith_story',
  });
}

/** Generates fresh text for a slot -- refuses to overwrite text that
 * already exists (use regenerateSlotText for that, an explicit action per
 * the task). Creates the `telegram_posts` row if none exists yet. */
export async function generateSlotText(civilDateIso: string, contentTypeInput: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const { facts, verifiedFacts, verify } = await loadVerifiedFactsOrThrow(civilDateIso, contentType);

  const post = await resolveOrCreateSlot(civilDateIso, contentType, facts);
  assertMutable(post);
  if (verifiedFacts) await verify(post.id);
  if (post.text?.trim()) {
    throw ApiError.conflict('this slot already has text -- use regenerate to replace it');
  }

  const text = await buildText(contentType, facts, civilDateIso, julianDateIso, verifiedFacts);
  return setPreparedPostText(post.id, text);
}

/** Always overwrites, even if text already exists -- explicit action per
 * the task ("Regenerate требует explicit action"). Demotes ready->draft
 * (setPreparedPostText's own behavior). Never touches a sent/sending row. */
export async function regenerateSlotText(civilDateIso: string, contentTypeInput: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const { facts, verifiedFacts, verify } = await loadVerifiedFactsOrThrow(civilDateIso, contentType);

  const post = await resolveOrCreateSlot(civilDateIso, contentType, facts);
  assertMutable(post);
  if (verifiedFacts) await verify(post.id);

  const text = await buildText(contentType, facts, civilDateIso, julianDateIso, verifiedFacts);
  return setPreparedPostText(post.id, text);
}

/** Manual edit -- no AI involved at all. Creates the row if none exists
 * yet (this is one of the task's explicit "row is created on this action"
 * triggers), demotes ready->draft. */
export async function editSlotText(civilDateIso: string, contentTypeInput: string, text: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const factsResult = await loadAutopostFacts(contentType, julianDateIso);
  if (factsResult.status !== 'ok') {
    throw ApiError.validation('no source data exists for this date/type yet (MISSING_SOURCE)');
  }

  const post = await resolveOrCreateSlot(civilDateIso, contentType, factsResult.facts);
  assertMutable(post);
  return setPreparedPostText(post.id, text);
}

/** Refuses to overwrite an existing image (use regenerate). Reuses
 * ensureAutopostImage()'s own existing priority (verified saint image ->
 * AI fallback) unchanged. */
export async function generateSlotImage(civilDateIso: string, contentTypeInput: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const { facts } = await loadVerifiedFactsOrThrow(civilDateIso, contentType);
  const post = await resolveOrCreateSlot(civilDateIso, contentType, facts);
  assertMutable(post);
  if (post.mediaUrl) {
    throw ApiError.conflict('this slot already has an image -- use regenerate to replace it');
  }

  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) throw ApiError.validation('OpenAI is not configured');
  await ensureAutopostImage({
    postId: post.id,
    existingMediaUrl: null,
    contentType,
    apiKey: openAiConfig.apiKey,
    imageModel: openAiConfig.imageModel,
    verifiedImageUrl: facts.verifiedImageUrl,
  });
  return getTelegramPost(post.id);
}

/**
 * Always attempts a fresh image, but -- unlike ensureAutopostImage()'s own
 * tick-time contract, where a failure clearing media_url is harmless
 * because the row never had an image before -- this restores the PREVIOUS
 * image on failure ("Existing image не видаляти до успішного отримання
 * нового"). ensureAutopostImage() itself is never modified: its failure
 * path already records image_error on the row, this just re-reads that
 * and re-persists the old URL alongside it.
 */
export async function regenerateSlotImage(civilDateIso: string, contentTypeInput: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const { facts } = await loadVerifiedFactsOrThrow(civilDateIso, contentType);
  const post = await resolveOrCreateSlot(civilDateIso, contentType, facts);
  assertMutable(post);
  const previousMediaUrl = post.mediaUrl;

  const openAiConfig = await getOpenAiConfig();
  if (!openAiConfig) throw ApiError.validation('OpenAI is not configured');
  const newMediaUrl = await ensureAutopostImage({
    postId: post.id,
    existingMediaUrl: null,
    contentType,
    apiKey: openAiConfig.apiKey,
    imageModel: openAiConfig.imageModel,
    verifiedImageUrl: facts.verifiedImageUrl,
  });

  if (!newMediaUrl && previousMediaUrl) {
    const afterAttempt = await getTelegramPost(post.id);
    return setAutopostImageResult(post.id, previousMediaUrl, afterAttempt.imageError);
  }
  return getTelegramPost(post.id);
}

/** "Обрати з медіатеки" -- persists an already-uploaded R2 URL directly,
 * no new upload, no AI call. Creates the row if none exists yet. */
export async function assignSlotImage(civilDateIso: string, contentTypeInput: string, mediaUrl: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const factsResult = await loadAutopostFacts(contentType, julianDateIso);
  if (factsResult.status !== 'ok') {
    throw ApiError.validation('no source data exists for this date/type yet (MISSING_SOURCE)');
  }

  const post = await resolveOrCreateSlot(civilDateIso, contentType, factsResult.facts);
  assertMutable(post);
  return setAutopostImageResult(post.id, mediaUrl, null);
}

/**
 * "Позначити готовим" -- draft -> ready only if validateBeforeSend()
 * (the exact same gate the autopost tick and manual publish route already
 * trust) passes. Image is confirmed NOT part of that check today
 * (pre-send-validator.ts only checks text + verification), so it is
 * intentionally not required here either -- per the task's own "inspect
 * existing policy, don't invent a new rule".
 */
export async function markSlotReady(civilDateIso: string, contentTypeInput: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const post = await findTelegramPostBySlot(contentType, civilDateIso);
  if (!post) throw ApiError.notFound('nothing has been prepared for this slot yet');
  assertMutable(post);

  const check = validateBeforeSend({ contentType, verificationStatus: post.verificationStatus, text: post.text });
  if (!check.ok) throw ApiError.validation(`cannot mark ready: ${check.reason}`);

  const updated = await setAutopostSlotReady(post.id);
  if (!updated) throw ApiError.conflict('slot is not in a state that can be marked ready');
  return updated;
}

/** "Зняти з готовності" -- ready -> draft only. */
export async function markSlotUnready(civilDateIso: string, contentTypeInput: string): Promise<TelegramPostDto> {
  const contentType = requireContentType(contentTypeInput);
  const post = await findTelegramPostBySlot(contentType, civilDateIso);
  if (!post) throw ApiError.notFound('nothing has been prepared for this slot yet');
  assertMutable(post);

  const updated = await setAutopostSlotUnready(post.id);
  if (!updated) throw ApiError.conflict('slot is not currently ready');
  return updated;
}
