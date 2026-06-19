'use client';

import Link from 'next/link';
import { LanguageSwitch, useI18n } from './LanguageProvider';

const nav = [
  ['navIcons', '/icons'],
  ['navPrayers', '/prayers'],
  ['navSaints', '/saints'],
  ['navGospel', '/gospel'],
  ['navChurches', '/churches']
] as const;

export function Header() {
  const { t } = useI18n();

  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span>☦</span>
        <small>{t('brand')}</small>
      </Link>
      <nav>
        {nav.map(([label, href]) => <Link key={href} href={href}>{t(label)}</Link>)}
      </nav>
      <div className="header-tools">
        <LanguageSwitch />
        <Link className="header-action" href="/churches">{t('forChurches')}</Link>
      </div>
    </header>
  );
}
