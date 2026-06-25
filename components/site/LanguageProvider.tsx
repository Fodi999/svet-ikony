'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { defaultLocale, localeFromPathname, localeNames, locales, translate, type Locale, type TranslationKey, withLocale } from '@/lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = localeFromPathname(pathname || `/${defaultLocale}`);

  const setLocale = (nextLocale: Locale) => {
    const query = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '');
    const nextPath = withLocale(pathname || '/', nextLocale);
    router.push(`${nextPath}${query ? `?${query}` : ''}`, { scroll: false });
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => translate(locale, key)
  }), [locale, pathname, router]);

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
    <div className="language-switch" aria-label={t('langLabel')}>
      {locales.map((item) => (
        <button
          key={item}
          className={locale === item ? 'active' : ''}
          type="button"
          onClick={() => setLocale(item)}
        >
          {localeNames[item]}
        </button>
      ))}
    </div>
  );
}
