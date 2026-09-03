/**
 * Deterministic guard against a foreign-language leak into otherwise-
 * Ukrainian AI-generated prose -- shared by every text-generating caller of
 * lib/ai/openai.ts's generateTelegramPost (Telegram autopost) and
 * lib/ai/church-content.ts's generateChurchContent (Church Calendar editor)
 * on purpose, per the explicit requirement to reuse one implementation
 * rather than maintain two. Runs AFTER a completion comes back, in
 * addition to (never instead of) the system prompt's own "Ukrainian only"
 * instruction -- a real production incident (saint_of_day, 2026-09-03,
 * telegram_posts.id=19) shipped "...апостолів Христових, які spread the
 * Gospel, несучи..." to the live channel despite the prompt already saying
 * "пиши ЛИШЕ українською мовою", proving the instruction alone is not
 * reliable enough to skip a deterministic check.
 *
 * Two independent signals, chosen to catch the real failure mode without
 * "any Latin character = reject" (which would false-positive on URLs,
 * technical identifiers, and legitimate single proper names/brand names --
 * see this module's own test file for concrete false-positive checks):
 *
 *  1. Two or more CONSECUTIVE Latin-script word tokens. A single Latin
 *     token (a proper name, a brand like "Telegram"/"OpenAI", an acronym)
 *     is tolerated; an actual English/Polish/Latin-transliterated PHRASE
 *     never occurs by accident as a single token, only as a run of them.
 *     This is exactly the shape of the real incident ("spread the Gospel"
 *     -- three consecutive Latin words).
 *  2. Any of the four Cyrillic letters that exist in Russian but never in
 *     correct Ukrainian orthography (ы, э, ъ, ё). Russian shares the rest
 *     of the Cyrillic alphabet with Ukrainian, so a same-script "is this
 *     Cyrillic" check can't distinguish them -- these four letters are the
 *     cheap, reliable, deterministic signal that actually does.
 *
 * Polish (Latin script) and Latin transliterations are already covered by
 * signal 1 -- no separate check needed for either.
 */

export type LanguageGuardResult = { ok: true } | { ok: false; reason: 'latin_phrase' | 'russian_letters'; evidence: string };

const RUSSIAN_ONLY_LETTERS = /[ыэъё]/i;

/** Stripped out (replaced with a space) before the word-run scan, so a URL
 * or email address is never mistaken for a run of ordinary Latin words --
 * it's one unbroken non-whitespace token to begin with, but this also
 * guards against a scheme/host split by unusual whitespace in the source
 * text. */
const URL_OR_EMAIL = /\b(?:https?:\/\/|www\.)\S+|\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

/** Leading/trailing punctuation and typographic quotes/dashes only -- an
 * internal apostrophe (an ordinary letter in Ukrainian, "об'єкт") or a
 * digit is left alone, so it's never mistaken for a word boundary. */
const EDGE_PUNCTUATION = /^[\s"'«»“”„‘’()[\]{}.,!?:;…—–-]+|[\s"'«»“”„‘’()[\]{}.,!?:;…—–-]+$/g;

function isLatinWord(core: string): boolean {
  return /^[a-zA-Z]+$/.test(core) && core.length >= 2;
}

export function checkUkrainianLanguage(text: string): LanguageGuardResult {
  const russianMatch = RUSSIAN_ONLY_LETTERS.exec(text);
  if (russianMatch) {
    const start = Math.max(0, russianMatch.index - 15);
    return {
      ok: false,
      reason: 'russian_letters',
      evidence: text.slice(start, russianMatch.index + russianMatch[0].length + 15).trim(),
    };
  }

  const withoutUrls = text.replace(URL_OR_EMAIL, ' ');
  const tokens = withoutUrls.split(/\s+/);

  let streak: string[] = [];
  for (const token of tokens) {
    const core = token.replace(EDGE_PUNCTUATION, '');
    if (isLatinWord(core)) {
      streak.push(core);
      if (streak.length >= 2) {
        return { ok: false, reason: 'latin_phrase', evidence: streak.join(' ') };
      }
      continue;
    }
    // Anything else (a Cyrillic word, a number, punctuation-only, empty)
    // breaks the run -- only genuinely consecutive Latin words count as a
    // leaked phrase, never two unrelated Latin tokens elsewhere in the text.
    streak = [];
  }

  return { ok: true };
}

/** The exact user-facing phrase requested for this failure mode --
 * callers append `result.evidence` for an admin trying to locate and fix
 * the offending fragment. Kept as one literal string (not per-reason
 * variants) so the message is always recognizable regardless of which of
 * the two signals above tripped. */
export const LANGUAGE_GUARD_FAILURE_MESSAGE = 'Виявлено текст іншою мовою';

export function describeLanguageGuardFailure(result: Extract<LanguageGuardResult, { ok: false }>): string {
  return `${LANGUAGE_GUARD_FAILURE_MESSAGE}: "${result.evidence}"`;
}
