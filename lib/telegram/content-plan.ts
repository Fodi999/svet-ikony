import { listArticles } from '@/lib/d1/repositories/articles';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listSaints } from '@/lib/d1/repositories/saints';
import { listTelegramPosts, type TelegramPostDto } from '@/lib/d1/repositories/telegram';
import { AUTOPOST_CONTENT_TYPES, getAutopostSettings, type AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';
import { CONTENT_TYPE_AUDIO_CAPTIONS, CONTENT_TYPE_LINKED_CAPTIONS } from './content-format';
import { planDelivery, type DeliveryPlan } from './deliver-post';
import { gregorianToJulianCalendarDate } from './julian-calendar';
import { verifySaintOfDay } from './orthodox-calendar-verifier';
import { requiresCalendarVerification } from './pre-send-validator';

/**
 * Read-only admin "content plan" calendar (task: "TELEGRAM CONTENT PLAN —
 * YEAR CALENDAR UI"). Deliberately independent of autopost.ts/
 * autopost-content.ts -- never imported by them, never imports their
 * write paths (claimAutopostSlot, markTelegramPostSent/Failed, OpenAI,
 * TelegramClient) -- so this module can NEVER affect the live publishing
 * pipeline, no matter what it's used for. It calls the same repository
 * list*() functions the pipeline uses, but each exactly once for the
 * whole requested range, then answers every day from in-memory maps --
 * this is what makes a full-year view cost ~6 D1 queries instead of
 * 365 x 5.
 *
 * Calendar policy mirrors autopost-content.ts's loadAutopostFacts(): a
 * day "has" a content type's source only if (a) a church_calendar_days
 * row exists for that Julian/old-style date and (b) that type's own table
 * has a Ukrainian row linked to it. Kept as a second, read-only
 * implementation on purpose (see the module doc above) rather than
 * reusing loadAutopostFacts() directly, since that function re-queries
 * listCalendarDays() on every single call -- fine for one slot at tick
 * time, ruinous for 365 days here.
 *
 * The Telegram delivery preview (buildContentPlanDayDetail's
 * `deliveryPreview`) imports `planDelivery` from deliver-post.ts -- a
 * pure, side-effect-free function -- rather than reimplementing its
 * caption-length threshold. That module also exports `sendAutopostMessage`
 * (which does call Telegram), but this file never references it; its only
 * `TelegramClient` reference anywhere is a type-only import (erased at
 * compile time), so this module still never gains any actual capability
 * to send anything.
 */

export type ContentPlanSourceStatus = 'available' | 'missing_source' | 'insufficient_data';
export type ContentPlanVerificationStatus = 'verified' | 'failed' | null;
export type ContentPlanSlotStatus = 'SENT' | 'SENDING' | 'READY' | 'DRAFT' | 'SOURCE_READY' | 'MISSING_SOURCE' | 'REVIEW_REQUIRED' | 'FAILED';

export type ContentPlanSlot = {
  contentType: AutopostContentType;
  scheduledTime: string;
  sourceStatus: ContentPlanSourceStatus;
  verificationStatus: ContentPlanVerificationStatus;
  publicationStatus: ContentPlanSlotStatus;
  textAvailable: boolean;
  imageAvailable: boolean;
  /** Whether a manually-assigned audio file exists for this slot (new --
   * migration 0012). Unlike imageAvailable, there's no "source" fallback
   * here -- audio is never AI-generated and no calendar/saint table has an
   * audio field, so this is purely post?.audioUrl. */
  audioAvailable: boolean;
  sentAt: string | null;
  telegramMessageId: number | null;
  errorMessage: string | null;
  /** Detail-only fields -- populated ONLY by buildContentPlanDayDetail(),
   * always undefined from buildContentPlan()'s bulk list. Keeping full
   * text/images out of the year/month payload is what makes it cheap to
   * fetch a whole year at once (task: "не загружать тяжёлые full texts
   * для всего года"). */
  textPreview?: string;
  imageUrl?: string;
  /** Detail-only, same reasoning as imageUrl -- the assigned audio file's
   * public URL, for the "Медіа" block's player/file-name display. */
  audioUrl?: string;
  /** Untruncated current text -- unlike textPreview (always capped at 200
   * chars, kept for the smaller display use case), this is what an editor
   * needs to actually show/edit the real content. */
  fullText?: string;
  /** What production delivery would actually do with the current text +
   * photo + audio, computed via the real planDelivery() -- never a
   * reimplemented approximation. `photoCaption`/`audioCaption` are the
   * fixed linked captions for whichever split plan kinds include that
   * part, null otherwise (no caption needed, or that part isn't present
   * in this plan). */
  deliveryPreview?: { kind: DeliveryPlan['kind']; photoCaption: string | null; audioCaption: string | null };
};

export type ContentPlanDay = {
  civilDate: string;
  julianDate: string;
  calendarTitle: string | null;
  /** church_calendar_days.id for this Julian date, when a row exists --
   * lets the admin Day Drawer link back to "Церковний календар" (the
   * canonical source, see lib/church/calendar-ai-actions.ts) instead of
   * ever letting Telegram content invent facts of its own. Null exactly
   * when calendarTitle is null (no calendar day row for this date). */
  calendarDayId: string | null;
  slots: Record<AutopostContentType, ContentPlanSlot>;
};

export type ContentPlanSummary = {
  totalDays: number;
  sent: number;
  ready: number;
  draft: number;
  sourceReady: number;
  missingSource: number;
  reviewRequired: number;
  failed: number;
  coverage: Record<AutopostContentType, { available: number; missing: number }>;
};

export type ContentPlanReport = {
  generatedAt: string;
  fromCivilDate: string;
  toCivilDate: string;
  days: ContentPlanDay[];
  summary: ContentPlanSummary;
};

type PreloadedData = {
  calendarDaysByOldStyle: Map<string, { id: string; title: string }>;
  saintsByCalendarDay: Map<string, { name: string; imageUrl: string }>;
  gospelByCalendarDay: Map<string, { text: string; imageUrl: string }>;
  articlesByCalendarDay: Map<string, { content: string }>;
  prayersByCalendarDayAndType: Map<string, { text: string; imageUrl: string }>;
  postsByDateAndType: Map<string, TelegramPostDto>;
  scheduleTimeByType: Record<AutopostContentType, string>;
};

async function preloadData(): Promise<PreloadedData> {
  const [calendarDays, saints, gospel, prayers, articles, posts, settings] = await Promise.all([
    listCalendarDays({}),
    listSaints({ language: 'uk' }),
    listGospel({ language: 'uk' }),
    listPrayers({ language: 'uk' }),
    listArticles({ language: 'uk' }),
    listTelegramPosts(),
    getAutopostSettings(),
  ]);

  const calendarDaysByOldStyle = new Map<string, { id: string; title: string }>();
  for (const day of calendarDays) {
    if (day.dateOldStyle) calendarDaysByOldStyle.set(day.dateOldStyle, { id: day.id, title: day.title });
  }

  const saintsByCalendarDay = new Map<string, { name: string; imageUrl: string }>();
  for (const saint of saints) {
    if (saint.calendarDayId && !saintsByCalendarDay.has(saint.calendarDayId)) {
      saintsByCalendarDay.set(saint.calendarDayId, { name: saint.name, imageUrl: saint.imageUrl });
    }
  }

  const gospelByCalendarDay = new Map<string, { text: string; imageUrl: string }>();
  for (const reading of gospel) {
    if (reading.calendarDayId && !gospelByCalendarDay.has(reading.calendarDayId)) {
      gospelByCalendarDay.set(reading.calendarDayId, { text: reading.text, imageUrl: '' });
    }
  }

  const articlesByCalendarDay = new Map<string, { content: string }>();
  for (const article of articles) {
    if (article.calendarDayId && !articlesByCalendarDay.has(article.calendarDayId)) {
      articlesByCalendarDay.set(article.calendarDayId, { content: article.content });
    }
  }

  const prayersByCalendarDayAndType = new Map<string, { text: string; imageUrl: string }>();
  for (const prayer of prayers) {
    if (!prayer.calendarDayId) continue;
    const key = `${prayer.calendarDayId}|${prayer.prayerType}`;
    if (!prayersByCalendarDayAndType.has(key)) prayersByCalendarDayAndType.set(key, { text: prayer.text, imageUrl: prayer.imageUrl });
  }

  const postsByDateAndType = new Map<string, TelegramPostDto>();
  for (const post of posts) {
    if (!post.publishDate || !post.contentType) continue;
    postsByDateAndType.set(`${post.publishDate}|${post.contentType}`, post);
  }

  const scheduleTimeByType = Object.fromEntries(settings.items.map((item) => [item.contentType, item.scheduleTime])) as Record<
    AutopostContentType,
    string
  >;

  return { calendarDaysByOldStyle, saintsByCalendarDay, gospelByCalendarDay, articlesByCalendarDay, prayersByCalendarDayAndType, postsByDateAndType, scheduleTimeByType };
}

function sourceForType(
  data: PreloadedData,
  contentType: AutopostContentType,
  calendarDayId: string | undefined
): { status: ContentPlanSourceStatus; candidateName?: string; text?: string; imageUrl?: string } {
  if (!calendarDayId) return { status: 'missing_source' };

  if (contentType === 'saint_of_day') {
    const saint = data.saintsByCalendarDay.get(calendarDayId);
    if (!saint) return { status: 'insufficient_data' };
    return { status: 'available', candidateName: saint.name, text: saint.name, imageUrl: saint.imageUrl };
  }
  if (contentType === 'gospel') {
    const reading = data.gospelByCalendarDay.get(calendarDayId);
    if (!reading) return { status: 'insufficient_data' };
    return { status: 'available', text: reading.text, imageUrl: reading.imageUrl };
  }
  if (contentType === 'faith_story') {
    const article = data.articlesByCalendarDay.get(calendarDayId);
    if (!article) return { status: 'insufficient_data' };
    return { status: 'available', text: article.content };
  }
  const prayerType = contentType === 'morning_prayer' ? 'morning' : 'evening';
  const prayer = data.prayersByCalendarDayAndType.get(`${calendarDayId}|${prayerType}`);
  if (!prayer) return { status: 'insufficient_data' };
  return { status: 'available', text: prayer.text, imageUrl: prayer.imageUrl };
}

async function buildSlot(
  data: PreloadedData,
  contentType: AutopostContentType,
  civilDateIso: string,
  julianDateIso: string,
  calendarDayId: string | undefined,
  withPreview: boolean
): Promise<ContentPlanSlot> {
  const source = sourceForType(data, contentType, calendarDayId);
  const post = data.postsByDateAndType.get(`${civilDateIso}|${contentType}`);
  const scheduledTime = data.scheduleTimeByType[contentType] ?? '';

  let verificationStatus: ContentPlanVerificationStatus = null;
  let publicationStatus: ContentPlanSlotStatus;

  if (post) {
    verificationStatus = post.verificationStatus === 'verified' || post.verificationStatus === 'failed' ? post.verificationStatus : null;
    if (post.status === 'sent') publicationStatus = 'SENT';
    else if (post.status === 'failed') publicationStatus = verificationStatus === 'failed' ? 'REVIEW_REQUIRED' : 'FAILED';
    // 'sending' is the extremely short-lived state claimReadyAutopostSlot()
    // puts a row in between its atomic claim and the send completing,
    // within the same tick invocation -- unlikely to ever be observed here,
    // but surfaced as its own bucket (Content Plan Stage 3A) so the admin
    // never sees mutation buttons for a slot that may complete sending at
    // any moment (see Day Drawer's SlotCard, which hides every action for
    // SENDING exactly like it does for SENT).
    else if (post.status === 'sending') publicationStatus = 'SENDING';
    // 'ready' (Content Plan Stage 2: an admin explicitly confirmed this
    // slot's stored text/image are good to autopost) and a manually
    // 'scheduled' post both mean "this will go out without further admin
    // action" and surface as the same READY bucket.
    else if (post.status === 'scheduled' || post.status === 'ready') publicationStatus = 'READY';
    else publicationStatus = 'DRAFT';
  } else if (source.status !== 'available') {
    publicationStatus = 'MISSING_SOURCE';
  } else if (requiresCalendarVerification(contentType) && source.candidateName) {
    const result = await verifySaintOfDay({ civilDateIso, julianDateIso, candidateName: source.candidateName });
    verificationStatus = result.verified ? 'verified' : 'failed';
    publicationStatus = result.verified ? 'SOURCE_READY' : 'REVIEW_REQUIRED';
  } else {
    publicationStatus = 'SOURCE_READY';
  }

  const slot: ContentPlanSlot = {
    contentType,
    scheduledTime,
    sourceStatus: source.status,
    verificationStatus,
    publicationStatus,
    textAvailable: !!(post?.text?.trim() || source.text?.trim()),
    imageAvailable: !!(post?.mediaUrl || source.imageUrl),
    audioAvailable: !!post?.audioUrl,
    sentAt: post?.sentAt ?? null,
    telegramMessageId: post?.telegramMessageId ?? null,
    errorMessage: post?.errorMessage ?? null,
  };

  if (withPreview) {
    const fullText = post?.text?.trim() || source.text?.trim();
    if (fullText) {
      slot.textPreview = fullText.slice(0, 200);
      slot.fullText = fullText;
    }
    const previewImage = post?.mediaUrl || source.imageUrl;
    if (previewImage) slot.imageUrl = previewImage;
    const previewAudio = post?.audioUrl ?? null;
    if (previewAudio) slot.audioUrl = previewAudio;

    if (fullText) {
      const plan = planDelivery(fullText, previewImage ?? null, previewAudio);
      slot.deliveryPreview = {
        kind: plan.kind,
        photoCaption: plan.kind === 'photo_then_text' || plan.kind === 'photo_and_audio_then_text' ? CONTENT_TYPE_LINKED_CAPTIONS[contentType] : null,
        audioCaption: plan.kind === 'audio_then_text' || plan.kind === 'photo_and_audio_then_text' ? CONTENT_TYPE_AUDIO_CAPTIONS[contentType] : null,
      };
    }
  }

  return slot;
}

function civilDateRange(fromCivilDate: string, toCivilDate: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${fromCivilDate}T00:00:00Z`);
  const end = new Date(`${toCivilDate}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function emptySummary(): ContentPlanSummary {
  return {
    totalDays: 0,
    sent: 0,
    ready: 0,
    draft: 0,
    sourceReady: 0,
    missingSource: 0,
    reviewRequired: 0,
    failed: 0,
    coverage: Object.fromEntries(AUTOPOST_CONTENT_TYPES.map((t) => [t, { available: 0, missing: 0 }])) as Record<
      AutopostContentType,
      { available: number; missing: number }
    >,
  };
}

function accumulate(summary: ContentPlanSummary, slot: ContentPlanSlot): void {
  switch (slot.publicationStatus) {
    case 'SENT':
      summary.sent += 1;
      break;
    case 'READY':
    // SENDING is folded into the same summary bucket as READY -- both mean
    // "will go out without further admin action", and the state is too
    // short-lived to warrant its own summary count.
    case 'SENDING':
      summary.ready += 1;
      break;
    case 'DRAFT':
      summary.draft += 1;
      break;
    case 'SOURCE_READY':
      summary.sourceReady += 1;
      break;
    case 'MISSING_SOURCE':
      summary.missingSource += 1;
      break;
    case 'REVIEW_REQUIRED':
      summary.reviewRequired += 1;
      break;
    case 'FAILED':
      summary.failed += 1;
      break;
  }
  const bucket = summary.coverage[slot.contentType];
  if (slot.sourceStatus === 'available') bucket.available += 1;
  else bucket.missing += 1;
}

/** Bulk year/range view -- one aggregate payload, no per-slot text/images. */
export async function buildContentPlan(fromCivilDate: string, toCivilDate: string): Promise<ContentPlanReport> {
  const data = await preloadData();
  const summary = emptySummary();
  const days: ContentPlanDay[] = [];

  for (const civilDateIso of civilDateRange(fromCivilDate, toCivilDate)) {
    const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
    const calendarDay = data.calendarDaysByOldStyle.get(julianDateIso);

    const slots = {} as Record<AutopostContentType, ContentPlanSlot>;
    for (const contentType of AUTOPOST_CONTENT_TYPES) {
      const slot = await buildSlot(data, contentType, civilDateIso, julianDateIso, calendarDay?.id, false);
      slots[contentType] = slot;
      accumulate(summary, slot);
    }

    days.push({ civilDate: civilDateIso, julianDate: julianDateIso, calendarTitle: calendarDay?.title ?? null, calendarDayId: calendarDay?.id ?? null, slots });
    summary.totalDays += 1;
  }

  return { generatedAt: new Date().toISOString(), fromCivilDate, toCivilDate, days, summary };
}

/** Single-day detail -- includes text previews/thumbnails, fetched only
 * when the admin actually opens that day's drawer (task: "получать только
 * при открытии Drawer"). */
export async function buildContentPlanDayDetail(civilDateIso: string): Promise<ContentPlanDay> {
  const data = await preloadData();
  const julianDateIso = gregorianToJulianCalendarDate(civilDateIso);
  const calendarDay = data.calendarDaysByOldStyle.get(julianDateIso);

  const slots = {} as Record<AutopostContentType, ContentPlanSlot>;
  for (const contentType of AUTOPOST_CONTENT_TYPES) {
    slots[contentType] = await buildSlot(data, contentType, civilDateIso, julianDateIso, calendarDay?.id, true);
  }

  return { civilDate: civilDateIso, julianDate: julianDateIso, calendarTitle: calendarDay?.title ?? null, calendarDayId: calendarDay?.id ?? null, slots };
}
