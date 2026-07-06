'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { stripLocaleFromPathname } from '@/lib/i18n';
import { LanguageSwitch, useI18n, useLocaleHref } from './LanguageProvider';
import { SvgIcon } from './SvgIcon';

const nav = [
  ['navIcons', '/icons'],
  ['navPrayers', '/prayers'],
  ['navSaints', '/saints'],
  ['navGospel', '/gospel'],
  ['navChurches', '/churches'],
  ['navAlphabet', '/staroslavyanskaya-azbuka']
] as const;

export function Header() {
  const { t } = useI18n();
  const localeHref = useLocaleHref();
  const pathname = usePathname();
  const currentPath = stripLocaleFromPathname(pathname || '/');

  return (
    <header className="site-header">
      <Link className="brand" href={localeHref('/')}>
        <span className="brand-mark"><SvgIcon name="orthodox-cross" size={22} /></span>
        <span className="brand-copy">
          <small>{t('portal')}</small>
          <b>{t('brand')}</b>
        </span>
      </Link>
      <nav className="main-nav" aria-label={t('catalog')}>
        {nav.map(([label, href]) => {
          const active = currentPath === href || currentPath.startsWith(`${href}/`);
          return <Link key={href} className={active ? 'active' : ''} href={localeHref(href)}>{t(label)}</Link>;
        })}
      </nav>
      <div className="header-tools">
        <LanguageSwitch />
        <Link className="header-action" href={localeHref('/churches')}>{t('forChurches')}</Link>
      </div>
    </header>
  );
}
