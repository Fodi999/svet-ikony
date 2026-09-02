/**
 * Wikipedia/Wikimedia identity lookup for the Church Calendar's AI image
 * pipeline (see calendar-ai-actions.ts). Server-side only, public Wikipedia
 * REST/API endpoints, no API key. Fails closed on every uncertain signal:
 * the result of this module is either "verified" (safe to use as a
 * reference for AI generation) or a reason it isn't -- callers must never
 * treat "not verified" as "try harder", only as "fall back to the generic
 * thematic image".
 *
 * This module NEVER returns an image meant to be published directly --
 * see SaintReference's own doc comment. It only identifies whether a
 * reliable, correctly-attributed depiction exists, so the AI generation
 * step downstream has something to draw iconographic characteristics from.
 */

const WIKI_LANGUAGE = 'uk';
const SEARCH_TIMEOUT_MS = 6_000;
const SUMMARY_TIMEOUT_MS = 6_000;

/** Ukrainian saint-of-day titles are usually "<role> <name>" (e.g. "Апостол
 * Тадей", "Пророк Самуїл", "Священномученик Кипріан") -- the role prefix
 * is not part of the person's actual name and would only hurt a Wikipedia
 * title/text match, so it's stripped before searching or comparing. */
const ROLE_PREFIXES = [
  'святий', 'свята', 'святі',
  'апостол', 'апостоли',
  'пророк',
  'мученик', 'мучениця', 'мученики',
  'священномученик', 'священномучениця',
  'преподобномученик', 'преподобномучениця',
  'великомученик', 'великомучениця',
  'преподобний', 'преподобна',
  'блаженний', 'блаженна',
  'рівноапостольний', 'рівноапостольна',
  'святитель',
  'єпископ',
  'з числа 70-ти', 'з числа сімдесяти', "з числа дванадцяти",
];

/** Phrases that positively indicate the candidate article is actually
 * about a venerated Christian figure -- required so a same-named modern
 * person, place, or unrelated topic is never mistaken for the saint. */
const SANCTITY_KEYWORDS = [
  'святий', 'свята', 'святі', 'угодник',
  'апостол', 'пророк', 'мученик', 'мучениц', 'преподобн', 'блажен',
  'єпископ', 'митрополит', 'патріарх', 'ігумен', 'чудотворець',
  'saint', 'apostle', 'martyr', 'prophet', 'venerable', 'bishop', 'hieromartyr',
];

/** Known classification conflicts -- if OUR already-known facts assert one
 * side and the Wikipedia candidate's own text asserts the other, this is
 * not the same person, no matter how similar the name looks. Named after
 * the exact case called out in the task: Thaddeus of Edessa/Addai (one of
 * the Seventy) is not Jude Thaddeus (one of the Twelve). */
const CLASSIFICATION_CONTRADICTIONS: { ours: string[]; candidate: string[] }[] = [
  {
    ours: ['з числа 70', 'з числа сімдесяти', 'сімдесяти апостол', 'із сімдесяти', 'seventy apostles', 'apostle of the seventy'],
    candidate: ['twelve apostles', 'one of the twelve', 'дванадцяти апостол', 'із дванадцяти'],
  },
  {
    ours: ['з числа дванадцяти', 'дванадцяти апостол', 'із дванадцяти', 'twelve apostles', 'apostle of the twelve'],
    candidate: ['seventy apostles', 'one of the seventy', 'сімдесяти апостол', 'із сімдесяти'],
  },
];

export interface SaintIdentityQuery {
  /** The calendar day's or saint's own name field, e.g. "Апостол Тадей з
   * числа 70-ти" -- role prefixes are stripped internally. */
  name: string;
  /** Already-known, already-verified local facts (short description +
   * biography) -- used ONLY to detect a classification contradiction in a
   * candidate, never sent anywhere or used to invent new claims. */
  knownFacts?: string;
}

/**
 * Everything needed to (a) show the admin where this came from and (b)
 * hand the reference image to the AI-description step -- but this is
 * explicitly NOT a publishable asset. Nothing in this codebase may set
 * church_calendar_days.image_url to sourceImageUrl directly; it exists
 * only as input to generateSaintIllustration()'s AI generation step. See
 * calendar-ai-actions.ts.
 */
export interface SaintReference {
  sourceProvider: 'wikipedia';
  sourcePageUrl: string;
  sourceImageUrl: string;
  sourceTitle: string;
  sourceAuthor?: string;
  sourceLicense?: string;
}

export type SaintLookupResult =
  | { status: 'verified'; reference: SaintReference }
  | { status: 'not_found' }
  | { status: 'ambiguous' }
  | { status: 'network_error' };

interface WikiSearchResult {
  title: string;
}
interface WikiSearchResponse {
  query?: { search?: WikiSearchResult[] };
}
interface WikiSummaryResponse {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  originalimage?: { source: string };
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

function stripRolePrefixes(name: string): string {
  let result = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of ROLE_PREFIXES) {
      const pattern = new RegExp(`^${prefix}\\s+`, 'i');
      if (pattern.test(result)) {
        result = result.replace(pattern, '').trim();
        changed = true;
      }
      const suffixPattern = new RegExp(`\\s+${prefix}$`, 'i');
      if (suffixPattern.test(result)) {
        result = result.replace(suffixPattern, '').trim();
        changed = true;
      }
    }
  }
  return result || name.trim();
}

/** Splits a compound name ("Флор і Лавр") into individual parts, since
 * each half must independently be matchable against a candidate title --
 * a Wikipedia article about only one of the two is not a reliable
 * reference for the pair. */
function nameParts(coreName: string): string[] {
  return coreName
    .split(/\s+(?:і|та|and|&)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Deliberately does NOT catch a fetch()-level failure (network error,
 * timeout/abort) -- those propagate to lookupVerifiedSaintReference()'s
 * own try/catch, which maps them to 'network_error' so callers can tell
 * "Wikipedia is unreachable right now" apart from "no such article"
 * (returned as `null` here only for a clean non-OK HTTP response or an
 * unparseable body -- both genuine "nothing usable here" outcomes, mapped
 * to 'not_found' by the caller).
 */
async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function searchWikipedia(query: string): Promise<string | null> {
  const url = `https://${WIKI_LANGUAGE}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json`;
  const body = await fetchJson<WikiSearchResponse>(url, SEARCH_TIMEOUT_MS);
  const results = body?.query?.search;
  if (!results || results.length === 0) return null;
  return results[0].title;
}

async function fetchSummary(title: string): Promise<WikiSummaryResponse | null> {
  const url = `https://${WIKI_LANGUAGE}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  return fetchJson<WikiSummaryResponse>(url, SUMMARY_TIMEOUT_MS);
}

function hasClassificationContradiction(knownFacts: string, candidateText: string): boolean {
  const ours = normalize(knownFacts);
  const theirs = normalize(candidateText);
  return CLASSIFICATION_CONTRADICTIONS.some(
    (pair) => pair.ours.some((k) => ours.includes(normalize(k))) && pair.candidate.some((k) => theirs.includes(normalize(k))),
  );
}

/**
 * Conservative by design (task: "При ambiguity: DO NOT use reference"):
 * every check below can only REJECT a candidate, never grant extra
 * confidence -- a candidate has to pass every single one to be usable.
 */
function verifyCandidate(summary: WikiSummaryResponse, coreName: string, knownFacts: string | undefined): boolean {
  if (!summary.title || summary.type === 'disambiguation') return false;

  const image = summary.originalimage?.source || summary.thumbnail?.source;
  if (!image) return false;

  const candidateText = `${summary.title} ${summary.description ?? ''} ${summary.extract ?? ''}`;
  const normalizedCandidate = normalize(candidateText);

  const parts = nameParts(coreName);
  const nameMatches = parts.every((part) => normalizedCandidate.includes(normalize(part)));
  if (!nameMatches) return false;

  const hasSanctityKeyword = SANCTITY_KEYWORDS.some((keyword) => normalizedCandidate.includes(normalize(keyword)));
  if (!hasSanctityKeyword) return false;

  if (knownFacts && hasClassificationContradiction(knownFacts, candidateText)) return false;

  return true;
}

/**
 * Looks up and verifies a Wikipedia identity for a saint's canonical name.
 * Never throws -- a network failure, missing article, disambiguation page,
 * or any verification failure all resolve to a non-'verified' status so
 * callers can fall back to the generic thematic image without special-
 * casing errors (task: "Network failure ... не должен ломать Calendar
 * editor. Fail gracefully to safe fallback").
 */
export async function lookupVerifiedSaintReference(query: SaintIdentityQuery): Promise<SaintLookupResult> {
  const coreName = stripRolePrefixes(query.name);
  if (!coreName) return { status: 'not_found' };

  let title: string | null;
  try {
    title = await searchWikipedia(coreName);
  } catch {
    return { status: 'network_error' };
  }
  if (!title) return { status: 'not_found' };

  let summary: WikiSummaryResponse | null;
  try {
    summary = await fetchSummary(title);
  } catch {
    return { status: 'network_error' };
  }
  if (!summary) return { status: 'not_found' };

  if (!verifyCandidate(summary, coreName, query.knownFacts)) {
    return { status: summary.type === 'disambiguation' ? 'ambiguous' : 'not_found' };
  }

  const sourceImageUrl = summary.originalimage?.source || summary.thumbnail?.source;
  if (!sourceImageUrl) return { status: 'not_found' };

  return {
    status: 'verified',
    reference: {
      sourceProvider: 'wikipedia',
      sourcePageUrl: summary.content_urls?.desktop?.page ?? `https://${WIKI_LANGUAGE}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      sourceImageUrl,
      sourceTitle: summary.title ?? title,
    },
  };
}
