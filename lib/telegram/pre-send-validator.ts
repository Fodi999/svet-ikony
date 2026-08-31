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
 * Every post published by this pipeline is Ukrainian-only by construction
 * (lib/telegram/autopost-content.ts always queries D1 with language:
 * 'uk') -- there is no per-post language field to check against, so this
 * validator's "language = uk" requirement is satisfied structurally
 * rather than by a runtime language-detection call, which would be a
 * fragile, non-deterministic thing to bolt on here.
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

  return { ok: true };
}
