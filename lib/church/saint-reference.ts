/**
 * Multi-provider saint identity + visual reference resolver for the Church
 * Calendar's AI image pipeline (see calendar-ai-actions.ts). Server-side
 * only, public Wikipedia/Wikidata/Wikimedia Commons REST/API endpoints, no
 * API key, no arbitrary URL fetching (see TRUSTED_HOSTS). Fails closed on
 * every uncertain signal: the result is either "verified" (safe to use as a
 * reference for AI generation) or a reason it isn't -- callers must never
 * treat "not verified" as "try harder", only as "fall back to the generic
 * thematic image".
 *
 * This module NEVER returns an image meant to be published directly -- see
 * SaintReference's own doc comment. It only identifies whether a reliable,
 * correctly-attributed depiction exists, so the AI generation step
 * downstream has something to draw iconographic characteristics from.
 *
 * PROVIDER CHAIN (general, reusable for any saint -- not an Agathonicus
 * special case; see saint-reference.test.ts's regression fixture):
 *
 *   1. Direct search on uk.wikipedia.org, then ru.wikipedia.org, using the
 *      calendar's own (Ukrainian) saint name. Cheapest path, works whenever
 *      that language edition happens to have a matching article under a
 *      spelling our search can find.
 *   2. If both fail: Wikidata entity search (wbsearchentities) using the
 *      SAME Ukrainian name against the 'uk' and then 'ru' label/alias
 *      index. This is the mechanism that actually reaches the English
 *      article for a saint with no adequate uk/ru Wikipedia coverage --
 *      Wikidata indexes labels/aliases per source language, so no
 *      translation/transliteration step is needed to search it. (A blind
 *      full-text search of en.wikipedia.org using an un-translated
 *      Cyrillic query would return nothing useful, which is why "EN
 *      Wikipedia" is reached THROUGH Wikidata's sitelinks here rather than
 *      as an independent direct-search stage.)
 *      Each Wikidata hit is filtered by its own description (rejects
 *      obvious non-saint entities: asteroids, towns, films, ...), then its
 *      sitelinks are checked in en -> ru -> uk order until one verifies.
 *      A wrong same-named namesake (e.g. a modern bishop, an unrelated
 *      saint) is rejected by the same classification/sanctity checks as
 *      every other path -- Wikidata's search ranking is never trusted
 *      blindly (task: "не брать автоматически первый результат").
 *   3. Once ANY provider verifies an identity, its Wikidata item (returned
 *      directly by the REST summary endpoint as `wikibase_item`, or by the
 *      search hit's own id) is used to look up a linked Commons category
 *      (P373) and, only now that identity is confirmed, Commons is
 *      searched for a better-categorized historical depiction (icon /
 *      fresco / mosaic / manuscript), ranked and filtered by keyword
 *      before ever being accepted -- see COMMONS_ACCEPT_KEYWORDS /
 *      COMMONS_REJECT_KEYWORDS. If nothing acceptable is found there, the
 *      already-verified Wikipedia image is kept; Commons never runs (and
 *      never can succeed) without an already-confirmed identity.
 *   4. If nothing verifies anywhere: not_found/ambiguous/network_error, and
 *      the caller falls back to the generic thematic image -- last resort,
 *      never the default.
 *
 * Known limitations (disclosed, not silently swept under the rug):
 *  - Cross-language name matching relies on classification/sanctity
 *    keyword checks plus Wikidata's own label/alias confirmation, not a
 *    real transliteration engine. `classicalGreekLatinVariant()` covers
 *    only the common Latin "-icus"/Greek "-ikos" Romanization pattern seen
 *    across many Byzantine names -- it is a best-effort alias generator,
 *    not exhaustive.
 *  - Toponym/feast-date/companion cross-checking (deeper identity signals
 *    than name+classification) is not implemented -- verification here is
 *    name + sanctity-keyword + classification-contradiction only, matching
 *    the conservative-but-not-exhaustive checks this module has always
 *    used.
 *  - Commons ranking is keyword-based (filename/category text), not a
 *    vision classifier -- it cannot detect e.g. a mislabeled modern photo
 *    whose filename happens to contain an accepted keyword.
 */

export type WikiLanguage = 'uk' | 'ru' | 'en';

const WIKI_HOSTS: Record<WikiLanguage, string> = {
  uk: 'uk.wikipedia.org',
  ru: 'ru.wikipedia.org',
  en: 'en.wikipedia.org',
};

/** Every host this module is allowed to fetch from -- constructed
 * exclusively from hardcoded values below, never from user/candidate input
 * as a URL. Defense in depth against SSRF (task: "Никакого arbitrary URL
 * fetching"): even a future bug that accidentally threads unvalidated text
 * into a URL cannot make this module reach an untrusted host. */
const TRUSTED_HOSTS = new Set<string>([
  ...Object.values(WIKI_HOSTS),
  'www.wikidata.org',
  'commons.wikimedia.org',
]);

const API_TIMEOUT_MS = 5_000;
/** Bounds worst-case chain latency (task: Cloudflare Workers compatibility)
 * -- at most this many Wikidata search hits get a full sitelink-verification
 * attempt (each attempt is up to 3 summary fetches, en/ru/uk in order). */
const MAX_WIKIDATA_CANDIDATES = 2;

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
 * person, place, or unrelated topic is never mistaken for the saint.
 * Deliberately stem-based (not full inflected words) so the SAME list
 * catches Ukrainian, Russian and English forms without needing a separate
 * per-language keyword set (task: "reusable for all saints, not a
 * hardcoded... exception") -- e.g. 'свят' matches святий/свята/святой/
 * святая/святые alike. */
const SANCTITY_KEYWORDS = [
  'свят', 'угодник',
  'апостол', 'пророк', 'мученик', 'мучениц', 'преподобн', 'блажен',
  'єпископ', 'епископ', 'митрополит', 'патріарх', 'патриарх', 'ігумен', 'игумен', 'чудотворц',
  'saint', 'apostle', 'martyr', 'prophet', 'venerable', 'bishop', 'hieromartyr',
];

/** Known classification conflicts -- if OUR already-known facts assert one
 * side and the candidate's own text asserts the other, this is not the
 * same person, no matter how similar the name looks. Named after the exact
 * case called out in an earlier stage's task: Thaddeus of Edessa/Addai
 * (one of the Seventy) is not Jude Thaddeus (one of the Twelve). Includes
 * both Ukrainian and Russian phrasing since a candidate can now come from
 * either language edition. */
const CLASSIFICATION_CONTRADICTIONS: { ours: string[]; candidate: string[] }[] = [
  {
    ours: ['з числа 70', 'з числа сімдесяти', 'сімдесяти апостол', 'із сімдесяти', 'из семидесяти', 'семидесяти апостол', 'seventy apostles', 'apostle of the seventy'],
    candidate: ['twelve apostles', 'one of the twelve', 'дванадцяти апостол', 'із дванадцяти', 'двенадцати апостол', 'из двенадцати'],
  },
  {
    ours: ['з числа дванадцяти', 'дванадцяти апостол', 'із дванадцяти', 'двенадцати апостол', 'из двенадцати', 'twelve apostles', 'apostle of the twelve'],
    candidate: ['seventy apostles', 'one of the seventy', 'сімдесяти апостол', 'із сімдесяти', 'семидесяти апостол', 'из семидесяти'],
  },
];

/** Wikidata entities whose EN description clearly marks them as not a
 * venerated person at all -- cheap, coarse filter applied BEFORE spending a
 * network call resolving a Wikidata search hit's sitelinks (task: "не брать
 * автоматически первый результат" -- this is what lets an asteroid or a
 * town sharing the saint's name be skipped without ever being fetched). Not
 * exhaustive by design; real disambiguation still happens via the full
 * classification/sanctity check on whichever sitelink IS fetched. */
const WIKIDATA_REJECT_DESCRIPTION_KEYWORDS = [
  'asteroid', 'minor planet', 'crater', 'genus', 'species',
  'town in', 'village in', 'river', 'mountain', 'municipality',
  'film', 'song', 'album', 'novel', 'company', 'ship', 'given name', 'surname',
  'footballer', 'actor', 'actress', 'politician', 'journal', 'newspaper',
];

/** Filename/category keywords that positively indicate a historical
 * iconographic depiction. A Commons candidate is only ever used if it
 * matches at least one of these (task: "предпочитать icon/fresco/mosaic/
 * manuscript/historical church depiction... не брать автоматически первый
 * результат"). */
const COMMONS_ACCEPT_KEYWORDS = [
  'icon', 'ікона', 'икона',
  'fresco', 'фреска',
  'mosaic', 'мозаїка', 'мозаика',
  'manuscript', 'рукопис', 'рукопись',
  'miniature', 'мініатюра', 'миниатюра',
  'mural', 'wall painting',
  'church', 'храм', 'cathedral', 'собор', 'monastery', 'монастир', 'монастырь',
];

/** Filename/category keywords that reject a Commons candidate outright,
 * regardless of any accept-keyword also present (task: "отклонять
 * современных людей, актеров, unrelated namesakes, stock, logos,
 * AI-generated images, PDF/OCR noise"). */
const COMMONS_REJECT_KEYWORDS = [
  'actor', 'actress', 'footballer', 'politician', 'singer', 'musician', 'athlete',
  'logo', 'stock photo', 'shutterstock', 'getty images',
  'ai generated', 'ai-generated', 'midjourney', 'dall-e', 'dalle', 'stable diffusion',
  'screenshot', 'meme',
];
const COMMONS_REJECT_EXTENSIONS = ['.pdf'];

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
  sourceProvider: 'wikipedia' | 'commons';
  /** Set when sourceProvider is 'wikipedia': which edition verified the
   * identity (uk/ru direct search, or en/ru/uk reached via Wikidata
   * sitelinks). */
  sourceLanguage?: WikiLanguage;
  sourcePageUrl: string;
  sourceImageUrl: string;
  sourceTitle: string;
  sourceAuthor?: string;
  sourceLicense?: string;
  sourceAttribution?: string;
  /** Wikidata Q-id, when known -- the cross-language identity spine (task
   * section 3). Lets the SAME entity be recognized across uk/ru/en
   * editions without requiring literal string equality between them. */
  wikidataId?: string;
  /** Set when sourceProvider is 'commons'. */
  commonsFileTitle?: string;
  commonsCategory?: string;
}

export type SaintLookupResult =
  | { status: 'verified'; reference: SaintReference }
  | { status: 'not_found'; reason?: string }
  | { status: 'ambiguous'; reason?: string }
  | { status: 'network_error'; reason?: string };

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
  /** The saint's cross-language identity spine -- present on nearly every
   * standard Wikipedia article, no extra API call needed to obtain it. */
  wikibase_item?: string;
}

interface WikidataSearchHit {
  id: string;
  description?: string;
}
interface WikidataSearchResponse {
  search?: WikidataSearchHit[];
}
interface WikidataEntitySnak {
  mainsnak?: { datavalue?: { value?: unknown } };
}
interface WikidataEntity {
  sitelinks?: Record<string, { title?: string }>;
  claims?: Record<string, WikidataEntitySnak[]>;
}
interface WikidataEntityResponse {
  entities?: Record<string, WikidataEntity>;
}

interface CommonsFileHit {
  title: string;
}
interface CommonsSearchResponse {
  query?: { search?: CommonsFileHit[] };
}
interface CommonsCategoryResponse {
  query?: { categorymembers?: CommonsFileHit[] };
}
interface CommonsImageInfoResponse {
  query?: { pages?: Record<string, { imageinfo?: { url?: string; extmetadata?: Record<string, { value?: string }> }[] }> };
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
    .split(/\s+(?:і|та|и|and|&)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

/** Requires only the PRIMARY (first) word of each compound-name part to
 * appear in the candidate text, not the entire literal phrase. A saint's
 * calendar title is often "<PersonalName> <ToponymAdjective>" (e.g.
 * "Агафоник Никомидійський"), and the toponym adjective's spelling varies
 * across language editions/orthography (uk "Никомидійський" vs ru
 * "Никомидийский" vs simply absent from an EN/RU article's own title) --
 * requiring it verbatim would reject genuine matches for exactly that
 * reason (the regression this function exists to fix). The personal name
 * itself is the stable, load-bearing part; this relaxation never lowers
 * the bar for single-word names (Самуїл, Тадей, ...), where primaryWord
 * *is* the whole part. */
function primaryNameMatches(coreName: string, normalizedCandidate: string): boolean {
  const parts = nameParts(coreName);
  return parts.every((part) => {
    const words = part.split(/\s+/).filter(Boolean);
    const primaryWord = words[0] ?? part;
    return normalizedCandidate.includes(normalize(primaryWord));
  });
}

function assertTrustedHost(url: string): void {
  const host = new URL(url).host;
  if (!TRUSTED_HOSTS.has(host)) {
    throw new Error(`refusing to fetch untrusted host: ${host}`);
  }
}

/**
 * Deliberately does NOT catch a fetch()-level failure (network error,
 * timeout/abort) -- those propagate to the caller's own try/catch, which
 * maps them to 'network_error' so callers can tell "the provider is
 * unreachable right now" apart from "no such article" (returned as `null`
 * here only for a clean non-OK HTTP response or an unparseable body --
 * both genuine "nothing usable here" outcomes).
 */
async function fetchJson<T>(url: string, timeoutMs: number = API_TIMEOUT_MS): Promise<T | null> {
  assertTrustedHost(url);
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

async function searchWikipediaLang(language: WikiLanguage, query: string): Promise<string | null> {
  const url = `https://${WIKI_HOSTS[language]}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json`;
  const body = await fetchJson<WikiSearchResponse>(url);
  const results = body?.query?.search;
  if (!results || results.length === 0) return null;
  return results[0].title;
}

async function fetchSummaryLang(language: WikiLanguage, title: string): Promise<WikiSummaryResponse | null> {
  const url = `https://${WIKI_HOSTS[language]}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  return fetchJson<WikiSummaryResponse>(url);
}

function hasClassificationContradiction(knownFacts: string, candidateText: string): boolean {
  const ours = normalize(knownFacts);
  const theirs = normalize(candidateText);
  return CLASSIFICATION_CONTRADICTIONS.some(
    (pair) => pair.ours.some((k) => ours.includes(normalize(k))) && pair.candidate.some((k) => theirs.includes(normalize(k))),
  );
}

/**
 * Conservative by design: every check below can only REJECT a candidate,
 * never grant extra confidence -- a candidate has to pass every single one
 * to be usable. Checks that don't depend on the query's own script
 * (disambiguation/image/sanctity-keyword/classification-contradiction) are
 * shared by every provider; the literal name-substring check is skipped
 * for Wikidata-sourced candidates -- see verifyCandidate()'s own comment
 * for why.
 */
function verifyCandidateCore(summary: WikiSummaryResponse, knownFacts: string | undefined): boolean {
  if (!summary.title || summary.type === 'disambiguation') return false;

  const image = summary.originalimage?.source || summary.thumbnail?.source;
  if (!image) return false;

  const candidateText = `${summary.title} ${summary.description ?? ''} ${summary.extract ?? ''}`;
  const normalizedCandidate = normalize(candidateText);

  const hasSanctityKeyword = SANCTITY_KEYWORDS.some((keyword) => normalizedCandidate.includes(normalize(keyword)));
  if (!hasSanctityKeyword) return false;

  if (knownFacts && hasClassificationContradiction(knownFacts, candidateText)) return false;

  return true;
}

/**
 * Used for a DIRECT uk/ru Wikipedia search result, where nothing else yet
 * confirms this candidate is the right person -- MediaWiki full-text
 * search can return loosely-related pages, so the query's own core name
 * must still appear in the candidate's text (see primaryNameMatches()).
 * Wikidata-sourced candidates (tryWikidataIdentity()) intentionally do NOT
 * use this function -- see its own call site for why requiring a literal
 * match there would be wrong (task section 4: "Не требуй буквального
 * совпадения кириллического имени с английским после подтверждения
 * identity через Wikidata").
 */
function verifyCandidate(summary: WikiSummaryResponse, coreName: string, knownFacts: string | undefined): boolean {
  if (!verifyCandidateCore(summary, knownFacts)) return false;
  const candidateText = `${summary.title} ${summary.description ?? ''} ${summary.extract ?? ''}`;
  return primaryNameMatches(coreName, normalize(candidateText));
}

type ProviderOutcome =
  | { outcome: 'verified'; language: WikiLanguage; title: string; summary: WikiSummaryResponse }
  | { outcome: 'ambiguous' }
  | { outcome: 'not_found' }
  | { outcome: 'network_error' };

async function searchAndVerifyOnWikipedia(language: WikiLanguage, coreName: string, knownFacts: string | undefined): Promise<ProviderOutcome> {
  let title: string | null;
  try {
    title = await searchWikipediaLang(language, coreName);
  } catch {
    return { outcome: 'network_error' };
  }
  if (!title) return { outcome: 'not_found' };

  let summary: WikiSummaryResponse | null;
  try {
    summary = await fetchSummaryLang(language, title);
  } catch {
    return { outcome: 'network_error' };
  }
  if (!summary) return { outcome: 'not_found' };

  if (!verifyCandidate(summary, coreName, knownFacts)) {
    return { outcome: summary.type === 'disambiguation' ? 'ambiguous' : 'not_found' };
  }
  return { outcome: 'verified', language, title, summary };
}

async function searchWikidataEntities(language: 'uk' | 'ru', query: string): Promise<WikidataSearchHit[]> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${language}&format=json&type=item&limit=5`;
  const body = await fetchJson<WikidataSearchResponse>(url);
  return body?.search ?? [];
}

function isLikelyNonSaintWikidataCandidate(description: string | undefined): boolean {
  if (!description) return false;
  const d = normalize(description);
  return WIKIDATA_REJECT_DESCRIPTION_KEYWORDS.some((keyword) => d.includes(keyword));
}

async function fetchWikidataEntity(qid: string): Promise<{ sitelinks: Partial<Record<WikiLanguage, string>>; commonsCategory?: string } | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks%7Cclaims&format=json`;
  const body = await fetchJson<WikidataEntityResponse>(url);
  const entity = body?.entities?.[qid];
  if (!entity) return null;

  const sitelinks: Partial<Record<WikiLanguage, string>> = {};
  for (const language of ['uk', 'ru', 'en'] as const) {
    const title = entity.sitelinks?.[`${language}wiki`]?.title;
    if (title) sitelinks[language] = title;
  }

  const commonsValue = entity.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
  const commonsCategory = typeof commonsValue === 'string' ? commonsValue : undefined;

  return { sitelinks, commonsCategory };
}

type WikidataOutcome =
  | { outcome: 'verified'; language: WikiLanguage; title: string; summary: WikiSummaryResponse; qid: string; commonsCategory?: string }
  | { outcome: 'not_found' }
  | { outcome: 'network_error' };

/** Reaches an identity that has no adequate uk/ru Wikipedia coverage under
 * our own search terms, by searching WIKIDATA's own per-language label/
 * alias index with the SAME (Ukrainian) name -- no translation step
 * needed. This is the mechanism that actually resolves e.g. "Агафоник
 * Никомидійський" to the English "Agathonicus" article: a direct
 * en.wikipedia.org full-text search of the untranslated Cyrillic name
 * would return nothing, but Wikidata already has a Russian/Ukrainian
 * label or alias recorded on the entity itself. */
async function tryWikidataIdentity(coreName: string, knownFacts: string | undefined): Promise<WikidataOutcome> {
  let hits: WikidataSearchHit[];
  try {
    hits = await searchWikidataEntities('uk', coreName);
    if (hits.length === 0) hits = await searchWikidataEntities('ru', coreName);
  } catch {
    return { outcome: 'network_error' };
  }
  if (hits.length === 0) return { outcome: 'not_found' };

  let attempted = 0;
  let sawNetworkError = false;
  for (const hit of hits) {
    if (attempted >= MAX_WIKIDATA_CANDIDATES) break;
    if (isLikelyNonSaintWikidataCandidate(hit.description)) continue;
    attempted += 1;

    let entity: { sitelinks: Partial<Record<WikiLanguage, string>>; commonsCategory?: string } | null;
    try {
      entity = await fetchWikidataEntity(hit.id);
    } catch {
      sawNetworkError = true;
      continue;
    }
    if (!entity) continue;

    for (const language of ['en', 'ru', 'uk'] as const) {
      const title = entity.sitelinks[language];
      if (!title) continue;
      let summary: WikiSummaryResponse | null;
      try {
        summary = await fetchSummaryLang(language, title);
      } catch {
        sawNetworkError = true;
        continue;
      }
      if (!summary) continue;
      // Wikidata's own search already matched `coreName` against a
      // label/alias recorded on this entity in its source language --
      // that IS the name-match. Re-requiring the (possibly Cyrillic)
      // coreName to literally appear inside a resolved Latin-script
      // article's text would reject every genuine cross-script match (the
      // "Agathonicus" regression this whole function exists to fix), so
      // only the script-independent checks apply here.
      if (verifyCandidateCore(summary, knownFacts)) {
        return { outcome: 'verified', language, title, summary, qid: hit.id, commonsCategory: entity.commonsCategory };
      }
    }
  }
  return sawNetworkError ? { outcome: 'network_error' } : { outcome: 'not_found' };
}

/** Best-effort Latin<->Greek-transliteration variant for classical/
 * Byzantine saint names Romanized two different ways across sources: e.g.
 * "Agathonicus" (Latinized, common on English Wikipedia article titles)
 * vs "Agathonikos" (direct Greek transliteration, common in Wikimedia
 * Commons filenames/categories for Orthodox icons and frescoes). Covers
 * the common "c"->"k" plus "-us"->"-os" pattern seen across many similarly
 * Romanized names (e.g. Pancratius/Pankratios, Polycarp/Polykarpos), not
 * just this one saint -- see module doc comment's Known limitations for
 * what this does NOT cover. */
function classicalGreekLatinVariant(name: string): string | null {
  if (!/^[A-Za-z\s]+$/.test(name)) return null;
  const swapped = name.replace(/c/g, 'k').replace(/C/g, 'K').replace(/us\b/g, 'os').replace(/US\b/g, 'OS');
  return swapped !== name ? swapped : null;
}

function buildCommonsAliases(verifiedTitle: string): string[] {
  const aliases = new Set<string>([verifiedTitle, `Saint ${verifiedTitle}`, `St ${verifiedTitle}`]);
  const translit = classicalGreekLatinVariant(verifiedTitle);
  if (translit) {
    aliases.add(translit);
    aliases.add(`Saint ${translit}`);
  }
  return Array.from(aliases);
}

async function listCommonsCategoryFiles(category: string): Promise<CommonsFileHit[]> {
  const cat = category.startsWith('Category:') ? category : `Category:${category}`;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmtype=file&cmlimit=20&format=json`;
  const body = await fetchJson<CommonsCategoryResponse>(url);
  return body?.query?.categorymembers ?? [];
}

async function searchCommonsFiles(query: string): Promise<CommonsFileHit[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=10&format=json`;
  const body = await fetchJson<CommonsSearchResponse>(url);
  return body?.query?.search ?? [];
}

/** Score > 0 required to ever be used (task: "не брать автоматически первый
 * результат", "reject... ambiguous results") -- absence of a reject
 * keyword is not by itself evidence of being a genuine historical
 * depiction; at least one accept keyword must be present. */
function scoreCommonsTitle(title: string): number {
  const t = title.toLowerCase();
  if (COMMONS_REJECT_KEYWORDS.some((k) => t.includes(k))) return -1;
  if (COMMONS_REJECT_EXTENSIONS.some((ext) => t.endsWith(ext))) return -1;
  return COMMONS_ACCEPT_KEYWORDS.some((k) => t.includes(k)) ? 1 : 0;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

async function fetchCommonsFileInfo(fileTitle: string): Promise<{ url: string; author?: string; license?: string; attribution?: string } | null> {
  const title = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url%7Cextmetadata&format=json`;
  const body = await fetchJson<CommonsImageInfoResponse>(url);
  const pages = body?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;
  const meta = info.extmetadata ?? {};
  return {
    url: info.url,
    author: meta.Artist?.value ? stripHtml(meta.Artist.value) : undefined,
    license: meta.LicenseShortName?.value,
    attribution: meta.Attribution?.value ? stripHtml(meta.Attribution.value) : undefined,
  };
}

interface CommonsUpgrade {
  sourceImageUrl: string;
  sourcePageUrl: string;
  sourceTitle: string;
  commonsFileTitle: string;
  commonsCategory?: string;
  sourceAuthor?: string;
  sourceLicense?: string;
  sourceAttribution?: string;
}

/** First candidate (in the provider's own order) whose filename/category
 * text scores > 0 -- i.e. matches an accept keyword and no reject keyword/
 * extension (task: "не брать автоматически первый результат"; see
 * scoreCommonsTitle's own doc comment for why a 0 score isn't enough).
 * Returns undefined if the whole batch has nothing acceptable, so the
 * caller knows to try the NEXT alias/source rather than settling. */
function pickBestCommonsCandidate(candidates: CommonsFileHit[]): CommonsFileHit | undefined {
  return candidates.map((c) => ({ title: c.title, score: scoreCommonsTitle(c.title) })).filter((c) => c.score > 0)[0];
}

/**
 * Only ever called AFTER a Wikipedia/Wikidata identity has already been
 * verified (task: "Commons нельзя искать вслепую как самостоятельный
 * источник личности... Сначала должна быть подтверждена identity").
 * Prefers the Wikidata-linked Commons category (P373) when known; falls
 * back to trying verified name aliases IN ORDER, one at a time, moving to
 * the next only when the current one has nothing acceptable -- a search
 * call returning *some* files is not enough to stop on, only one
 * returning an ACCEPTABLE file is (the bug this two-step design fixes:
 * stopping at the first alias with any hits at all would have settled for
 * an unrelated Roman inscription over the correct icon just because it
 * happened to rank first under the "Agathonicus" spelling). Returns null
 * (keep the Wikipedia-sourced image) if nothing acceptable is found
 * anywhere -- this is an upgrade attempt, never a requirement.
 */
async function tryCommonsUpgrade(verifiedTitle: string, commonsCategory: string | undefined): Promise<CommonsUpgrade | null> {
  let winner: CommonsFileHit | undefined;

  if (commonsCategory) {
    const categoryCandidates = await listCommonsCategoryFiles(commonsCategory).catch(() => []);
    winner = pickBestCommonsCandidate(categoryCandidates);
  }

  if (!winner) {
    for (const alias of buildCommonsAliases(verifiedTitle)) {
      const aliasCandidates = await searchCommonsFiles(alias).catch(() => []);
      winner = pickBestCommonsCandidate(aliasCandidates);
      if (winner) break;
    }
  }
  if (!winner) return null;

  const info = await fetchCommonsFileInfo(winner.title).catch(() => null);
  if (!info?.url) return null;

  return {
    sourceImageUrl: info.url,
    sourcePageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(winner.title)}`,
    sourceTitle: winner.title.replace(/^File:/, ''),
    commonsFileTitle: winner.title,
    commonsCategory,
    sourceAuthor: info.author,
    sourceLicense: info.license,
    sourceAttribution: info.attribution,
  };
}

/**
 * Looks up and verifies an identity for a saint's canonical name across
 * uk/ru Wikipedia and, if needed, Wikidata's cross-language sitelinks, then
 * attempts to upgrade the reference image via Wikimedia Commons. Never
 * throws -- a network failure, missing article, disambiguation page, or
 * any verification failure all resolve to a non-'verified' status so
 * callers can fall back to the generic thematic image without special-
 * casing errors.
 */
export async function lookupVerifiedSaintReference(query: SaintIdentityQuery): Promise<SaintLookupResult> {
  const coreName = stripRolePrefixes(query.name);
  if (!coreName) return { status: 'not_found', reason: 'empty name after stripping role prefixes' };

  let sawAmbiguous = false;
  let sawNetworkError = false;
  let verified: { language: WikiLanguage; title: string; summary: WikiSummaryResponse; qid?: string; commonsCategory?: string } | null = null;

  for (const language of ['uk', 'ru'] as const) {
    const outcome = await searchAndVerifyOnWikipedia(language, coreName, query.knownFacts);
    if (outcome.outcome === 'verified') {
      verified = outcome;
      break;
    }
    if (outcome.outcome === 'ambiguous') sawAmbiguous = true;
    if (outcome.outcome === 'network_error') sawNetworkError = true;
  }

  if (!verified) {
    const wikidataOutcome = await tryWikidataIdentity(coreName, query.knownFacts).catch(() => ({ outcome: 'network_error' as const }));
    if (wikidataOutcome.outcome === 'verified') {
      verified = wikidataOutcome;
    } else if (wikidataOutcome.outcome === 'network_error') {
      sawNetworkError = true;
    }
  }

  if (!verified) {
    if (sawAmbiguous) return { status: 'ambiguous', reason: 'a candidate was found but rejected by identity verification' };
    if (sawNetworkError) return { status: 'network_error', reason: 'one or more identity providers were unreachable' };
    return { status: 'not_found', reason: 'no provider (uk/ru wikipedia, wikidata sitelinks) returned a verifiable identity' };
  }

  const sourceImageUrl = verified.summary.originalimage?.source || verified.summary.thumbnail?.source;
  if (!sourceImageUrl) return { status: 'not_found', reason: 'verified identity has no usable image on any resolved provider' };

  const qid = verified.qid ?? verified.summary.wikibase_item;
  let commonsCategory = verified.commonsCategory;
  if (qid && !commonsCategory) {
    const entity = await fetchWikidataEntity(qid).catch(() => null);
    commonsCategory = entity?.commonsCategory;
  }

  let reference: SaintReference = {
    sourceProvider: 'wikipedia',
    sourceLanguage: verified.language,
    sourcePageUrl: verified.summary.content_urls?.desktop?.page ?? `https://${WIKI_HOSTS[verified.language]}/wiki/${encodeURIComponent(verified.title)}`,
    sourceImageUrl,
    sourceTitle: verified.summary.title ?? verified.title,
    wikidataId: qid,
  };

  const commonsUpgrade = await tryCommonsUpgrade(reference.sourceTitle, commonsCategory).catch(() => null);
  if (commonsUpgrade) {
    reference = { ...reference, sourceProvider: 'commons', ...commonsUpgrade };
  }

  return { status: 'verified', reference };
}
