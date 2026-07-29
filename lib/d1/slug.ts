/** Mirrors assistant/src/interfaces/http/church_content.rs slugify() /
 * normalize_for_slug() exactly, including its Unicode-aware behavior: Rust's
 * `char::is_alphanumeric()` treats Cyrillic letters as alphanumeric too, so
 * a Cyrillic title slugifies to a Cyrillic slug, not a transliteration —
 * `\p{L}\p{N}` (Unicode letter/number classes) reproduces that, not
 * `[a-z0-9]`. */
export function slugify(value: string, fallback = 'item'): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .split('-')
    .filter(Boolean)
    .join('-');
  return normalized || fallback;
}
