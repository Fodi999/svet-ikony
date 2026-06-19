'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dictionary, localeNames, locales, type Locale, type TranslationKey } from '@/lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'uk';
  const stored = window.localStorage.getItem('site-locale');
  return locales.includes(stored as Locale) ? stored as Locale : 'uk';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('uk');

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem('site-locale', nextLocale);
    document.documentElement.lang = nextLocale;
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => dictionary[locale][key]
  }), [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
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
