'use client';

import Link from 'next/link';
import { useI18n } from './LanguageProvider';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <div>
        <strong>☦</strong>
        <small>{t('brand')}</small>
        <p>{t('footerText')}</p>
      </div>
      <div>
        <Link href="/icons">{t('navIcons')}</Link>
        <Link href="/p/pravoslavnaya-ikona-s-qr-kodom">{t('seoPage')}</Link>
        <Link href="/qr/home-001">{t('qrExample')}</Link>
      </div>
    </footer>
  );
}
