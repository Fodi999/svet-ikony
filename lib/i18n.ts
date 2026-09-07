import en from '@/messages/en.json';
import ru from '@/messages/ru.json';
import uk from '@/messages/uk.json';

export type Locale = 'uk' | 'ru' | 'en';

export const defaultLocale: Locale = 'uk';
export const locales: Locale[] = ['uk', 'ru', 'en'];

export const localeNames: Record<Locale, string> = {
  uk: 'UK',
  ru: 'RU',
  en: 'EN'
};

export const dictionary = {
  uk,
  ru,
  en
} as const;

export type TranslationKey = keyof typeof uk;

const localePattern = new RegExp(`^/(${locales.join('|')})(?=/|$)`);

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function localeFromPathname(pathname: string): Locale {
  const match = pathname.match(localePattern);
  return isLocale(match?.[1]) ? match[1] : defaultLocale;
}

export function stripLocaleFromPathname(pathname: string) {
  const stripped = pathname.replace(localePattern, '') || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function shouldKeepHref(href: string) {
  return (
    !href ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(href)
  );
}

export function withLocale(href: string, locale: Locale) {
  if (shouldKeepHref(href)) return href;

  const [pathAndQuery, hash = ''] = href.split('#');
  const [path = '/', query = ''] = pathAndQuery.split('?');
  if (!path.startsWith('/')) return href;
  if (path.startsWith('/_next') || path.startsWith('/api')) return href;

  const cleanPath = stripLocaleFromPathname(path);
  const localizedPath = cleanPath === '/' ? `/${locale}` : `/${locale}${cleanPath}`;
  return `${localizedPath}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

export function translate(locale: Locale, key: TranslationKey) {
  return dictionary[locale]?.[key] ?? dictionary[defaultLocale][key];
}

const pluralRulesCache = new Map<Locale, Intl.PluralRules>();

function pluralRulesFor(locale: Locale) {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * Locale-correct plural word for a count, via Intl.PluralRules (handles
 * uk/ru's one/few/many split, not just a singular/plural binary).
 */
export function pluralize(count: number, locale: Locale, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) {
  const category = pluralRulesFor(locale).select(count);
  return forms[category] ?? forms.other;
}
