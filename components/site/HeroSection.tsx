'use client';

import Link from 'next/link';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { PhoneMockup } from './PhoneMockup';
import { QRIconDemo } from './QRIconDemo';

export function HeroSection() {
  const { t } = useI18n();
  const localeHref = useLocaleHref();

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">{t('heroEyebrow')}</p>
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroText')}</p>
        <div className="hero-actions">
          <Link href={localeHref('/icons')}>{t('heroIconsCta')}</Link>
          <Link href={localeHref('/churches')}>{t('forChurches')}</Link>
        </div>
      </div>
      <div className="hero-visual">
        <QRIconDemo />
        <PhoneMockup />
      </div>
    </section>
  );
}
