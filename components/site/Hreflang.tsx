import { defaultLocale, type Locale } from '@/lib/i18n';
import { resolveLocaleAlternates } from '@/lib/seo';

/**
 * PHASE MULTILINGUAL-1 / P0.5. Renders `<link rel="alternate" hreflang="..">`
 * tags directly, instead of relying on Next's Metadata API
 * `alternates.languages` field to produce them -- see lib/seo.ts's
 * `pageMetadata()` for the full root-cause writeup of why that field's
 * *data* is correct but its *rendered HTML* isn't, in this Next.js build.
 * Short version: Next's own `<link>` for `alternates.languages` uses a
 * camelCase `hrefLang` prop, and the bundled React 19 SSR renderer has no
 * hrefLang->hreflang casing alias (unlike e.g. crossOrigin->crossorigin),
 * so it's served as literal `hrefLang="uk"` instead of `hreflang="uk"`.
 * Real browsers and spec-compliant crawlers don't care (HTML attribute
 * names are case-insensitive on the wire) but plenty of naive
 * case-sensitive SEO tooling does, which is what actually produced the
 * "curled prod, found ZERO hreflang tags" symptom this phase's audit
 * reported.
 *
 * The fix: render the tag ourselves with a literal lowercase `hreflang`
 * key, spread from a plain object so it's never written as the `hrefLang`
 * JSX identifier and never round-trips through the broken camelCase
 * branch. This works from anywhere in a Server Component tree -- React 19
 * hoists any `<link>` element with a valid `rel`+`href` into `<head>` on
 * its own (verified directly against
 * react-dom-server.node.production.js's `case "link"` handling, which
 * pushes into `renderState.hoistableChunks` regardless of render
 * position), so this doesn't need to live in a Head-like wrapper -- every
 * page that calls `pageMetadata()` renders `<Hreflang>` with the SAME
 * `locale`/`path`/`languages` args directly in its own JSX output.
 *
 * `alternates.canonical` (also from `pageMetadata()`) is NOT affected by
 * this bug -- `rel`/`href` are both in the SSR renderer's known-attribute
 * fast path -- so the canonical link keeps coming from Next's Metadata API
 * exactly as before; only the language alternates need this workaround.
 */
export function Hreflang({
  locale,
  path,
  languages,
  includeXDefault = true
}: {
  locale: Locale;
  path?: string;
  languages?: Partial<Record<Locale, string>>;
  includeXDefault?: boolean;
}) {
  const alternates = resolveLocaleAlternates({ locale, path, languages });
  if (!alternates.length) return null;
  const defaultAlternate = alternates.find((alt) => alt.locale === defaultLocale);
  // React's development client warns on the lowercase prop during locale
  // navigation. Use its canonical prop there; retain the production SSR
  // lowercase-attribute workaround documented above for existing SEO tooling.
  const languageAttribute = (value: string) => process.env.NODE_ENV === 'development'
    ? { hrefLang: value }
    : { hreflang: value };

  return (
    <>
      {alternates.map((alt) => (
        <link key={alt.locale} rel="alternate" href={alt.url} {...languageAttribute(alt.locale)} />
      ))}
      {includeXDefault && defaultAlternate ? (
        <link rel="alternate" href={defaultAlternate.url} {...languageAttribute('x-default')} />
      ) : null}
    </>
  );
}
