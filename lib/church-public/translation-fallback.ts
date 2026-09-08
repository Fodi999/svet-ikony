import { isLocale } from '@/lib/i18n';
import type { SiteLocale } from '@/lib/types';

const DEFAULT_LANGUAGE: SiteLocale = 'uk';

export type LanguageResolution = { ok: true; language: SiteLocale } | { ok: false; response: Response };

/**
 * PHASE MULTILINGUAL-1 / P0.3: validates `?language=` against the 3
 * supported locales. Absent -> deterministic default ('uk'), never
 * database sort order (the old `candidates[0]` behavior). Invalid (e.g.
 * "pl", "de") -> 400, never silently falls through to a substitution.
 */
export function resolveRequestedLanguage(searchParams: URLSearchParams): LanguageResolution {
  const raw = searchParams.get('language');
  if (raw === null) return { ok: true, language: DEFAULT_LANGUAGE };
  if (!isLocale(raw)) {
    return {
      ok: false,
      response: Response.json({ error: 'invalid_language', message: `Unsupported language "${raw}". Valid values: uk, ru, en.` }, { status: 400 })
    };
  }
  return { ok: true, language: raw };
}

/** `language`/`status` are typed as plain `string` here (not `SiteLocale`/
 * `ChurchContentStatus`) because the D1 repository row types this function
 * is called with (e.g. listAlphabetLetters's return type) type those
 * columns as `string` even though they're SiteLocale-valued at runtime --
 * matches the same looseness the original `item.language === language`
 * comparisons already relied on. */
type TranslatableItem = { language: string; status: string };

/**
 * PHASE MULTILINGUAL-1 / P0.1: given every row that shares this item's
 * translation group (or slug, for entities with no group column), splits
 * them into "published, visible now" candidates and finds the one matching
 * the requested language.
 *
 * Never substitutes a different language's row for the requested one --
 * that was the exact silent-fallback bug this replaces (`(language ?
 * candidates.find(...) : undefined) ?? candidates[0]`). `match` is `null`
 * when the requested language has no published row; `published` lists
 * every language that IS available, for the caller to render a
 * translation-unavailable notice instead of pretending.
 */
export function resolveTranslation<T extends TranslatableItem>(siblings: T[], requestedLanguage: SiteLocale, preview: boolean): { match: T | null; published: T[] } {
  const published = siblings.filter((item) => item.status === 'published' || preview);
  const match = published.find((item) => item.language === requestedLanguage) ?? null;
  return { match, published };
}

/**
 * PHASE MULTILINGUAL-1 / P0.2: groups `items` by `groupKey(item)`
 * (translation_group_id) and returns ONE representative row per group --
 * the row matching `language` if one exists (kept exactly as-is, any
 * status, same as the pre-existing "list returns everything, caller
 * filters by status" contract), otherwise the first PUBLISHED row in any
 * language (uk preferred), marked `translated: false` so the catalog can
 * render an explicit "not yet translated" marker instead of either (a)
 * silently pretending it's a real translation or (b) rendering a
 * genuinely empty catalog just because RU/EN rows don't exist yet. A
 * group with no row in the requested language AND no published row in any
 * language is omitted entirely -- matches the prior behavior where an
 * all-draft item was never listed as a real item either.
 */
export function applyListLanguageFallback<T extends TranslatableItem>(items: T[], language: string, groupKey: (item: T) => string): (T & { translated: boolean })[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = groupKey(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const result: (T & { translated: boolean })[] = [];
  for (const group of groups.values()) {
    const exact = group.find((item) => item.language === language);
    if (exact) {
      result.push({ ...exact, translated: true });
      continue;
    }
    const published = group.filter((item) => item.status === 'published');
    if (published.length === 0) continue;
    const fallback = published.find((item) => item.language === 'uk') ?? published[0];
    result.push({ ...fallback, translated: false });
  }
  return result;
}
