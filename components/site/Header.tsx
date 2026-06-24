'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();

  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span>☦</span>
        <span className="brand-copy">
          <small>{t('portal')}</small>
          <b>{t('brand')}</b>
        </span>
      </Link>
      <nav className="main-nav" aria-label={t('catalog')}>
        {nav.map(([label, href]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} className={active ? 'active' : ''} href={href}>{t(label)}</Link>;
        })}
      </nav>
      <div className="header-tools">
        <LanguageSwitch />
        <Link className="header-action" href="/churches">{t('forChurches')}</Link>
      </div>
    </header>
  );
}
