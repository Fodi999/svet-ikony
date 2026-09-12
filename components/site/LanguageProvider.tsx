'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { defaultLocale, localeFromPathname, localeNames, locales, translate, type Locale, type TranslationKey, withLocale } from '@/lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function LanguageProvider({ children, initialLocale = defaultLocale }: { children?: React.ReactNode; initialLocale?: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  // Rewrites can expose different pathnames during SSR and hydration.
  const locale = mounted ? localeFromPathname(pathname || `/${initialLocale}`) : initialLocale;

  const setLocale = (nextLocale: Locale) => {
    const query = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '');
    const nextPath = withLocale(pathname || '/', nextLocale);
    router.push(`${nextPath}${query ? `?${query}` : ''}`, { scroll: false });
    // A locale switch is a genuinely different server response for the
    // SAME route tree (getRequestLocale() reads the x-site-locale header
    // middleware sets, not a distinct file-system segment) -- router.push()
    // alone updates the URL/history immediately, but Next's client-side
    // Router Cache can still serve the previously-rendered page instead of
    // refetching, so the page content silently stays on the old language
    // until some later navigation happens to force a refetch (reported as
    // "have to click the language button twice"). router.refresh() is
    // Next's own documented way to force this navigation to re-fetch and
    // re-render fresh Server Component output for the current route.
    router.refresh();
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value: LanguageContextValue = {
    locale,
    setLocale,
    t: (key) => translate(locale, key)
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLocaleHref() {
  const { locale } = useI18n();
  return (href: string) => withLocale(href, locale);
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      data-language-switch
      className="inline-flex min-h-10 items-center border border-[rgba(232,211,169,.13)] rounded-full p-[3px] bg-[rgba(5,5,5,.24)] max-[640px]:min-h-9 max-[430px]:min-h-[34px]"
      aria-label={t('langLabel')}
    >
      {locales.map((item) => (
        <button
          key={item}
          className={`min-w-[38px] h-8 border-0 rounded-full px-2.5 text-[11px] font-black tracking-[.08em] cursor-pointer transition-colors duration-[180ms] ease-brand max-[640px]:min-w-[30px] max-[640px]:h-[30px] max-[640px]:px-1.5 max-[430px]:min-w-[28px] max-[430px]:h-7 max-[430px]:px-[5px] max-[430px]:text-[10px] ${
            locale === item ? 'bg-gold-light text-canvas hover:text-canvas' : 'bg-transparent text-muted-foreground hover:text-foreground'
          }`}
          type="button"
          aria-pressed={locale === item}
          onClick={() => setLocale(item)}
        >
          {localeNames[item]}
        </button>
      ))}
    </div>
  );
}
