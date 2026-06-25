'use client';

import Link from 'next/link';
import { useI18n, useLocaleHref } from './LanguageProvider';

export function ChurchSection() {
  const { t } = useI18n();
  const localeHref = useLocaleHref();

  return (
    <section className="church-section">
      <div>
        <p className="eyebrow">{t('forChurches')}</p>
        <h2>{t('churchSectionTitle')}</h2>
      </div>
      <p>{t('churchSectionText')}</p>
      <Link href={localeHref('/churches')}>{t('openSection')}</Link>
    </section>
  );
}
