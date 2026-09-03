import { checkUkrainianLanguage, describeLanguageGuardFailure } from '@/lib/ai/language-guard';
import { isAutopostContentType, type AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';
import { CONTENT_TYPES_REQUIRING_CALENDAR_VERIFICATION } from './content-format';

/**
 * The final gate before any Telegram sendPhoto/sendMessage call for an
 * autopost row -- called from both the tick orchestrator (autopost.ts)
 * and the admin publish/retry route, so neither path can ever send a
 * saint_of_day (or other calendar-claiming type) post whose calendar
 * verification didn't actually pass, regardless of how the row got into
 * that state (a stale row from before this feature existed, a bug
 * upstream, ...). Deliberately re-checks the row's OWN stored
 * verification_status rather than re-running verification here -- see
 * lib/telegram/orthodox-calendar-verifier.ts for where that already
 * happened, once, right after the slot was claimed.
 */
export function requiresCalendarVerification(contentType: string | null): boolean {
  return isAutopostContentType(contentType ?? '') && CONTENT_TYPES_REQUIRING_CALENDAR_VERIFICATION.has(contentType as AutopostContentType);
}

export type PreSendCheckInput = {
  contentType: string | null;
  verificationStatus: string | null;
  text: string | null;
};

export type PreSendCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Every post published by this pipeline is grounded in Ukrainian-only D1
 * facts by construction (lib/telegram/autopost-content.ts always queries
 * with language: 'uk') -- but that only guarantees the SOURCE facts are
 * Ukrainian, not that the AI-GENERATED prose built from them stays
 * Ukrainian throughout. It doesn't: a real published post (saint_of_day,
 * publish_date 2026-09-03, telegram_posts.id=19) leaked "...апостолів
 * Христових, які spread the Gospel, несучи..." to the live channel despite
 * the system prompt already saying "пиши ЛИШЕ українською мовою" (see
 * lib/ai/openai.ts, now further reinforced) -- proving the prompt alone is
 * not reliable enough to skip a deterministic check here. This is the
 * single gate every send/ready path already goes through (autopost.ts's
 * both paths, content-plan-actions.ts's markSlotReady, the admin publish/
 * retry route), so the language guard lives here once rather than being
 * duplicated at each call site -- it protects manually-edited text and
 * pre-existing rows too, not just freshly AI-generated text (which is also
 * checked earlier, right after generation, so a language leak never even
 * gets persisted in the first place -- see content-plan-actions.ts's
 * buildText, autopost.ts's full-generation path, and the publish route's
 * regenerateAutopostTextIfMissing).
 */
export function validateBeforeSend(input: PreSendCheckInput): PreSendCheckResult {
  if (!input.text) {
    return { ok: false, reason: 'no_text' };
  }

  if (requiresCalendarVerification(input.contentType)) {
    if (input.verificationStatus !== 'verified') {
      return { ok: false, reason: `calendar_not_verified:${input.verificationStatus ?? 'null'}` };
    }
  }

  const languageCheck = checkUkrainianLanguage(input.text);
  if (!languageCheck.ok) {
    return { ok: false, reason: `${describeLanguageGuardFailure(languageCheck)} (${languageCheck.reason})` };
  }

  return { ok: true };
}
