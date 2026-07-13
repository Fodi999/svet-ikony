'use client';

import Link from 'next/link';
import { BrandLogo } from './BrandLogo';
import { useI18n, useLocaleHref } from './LanguageProvider';

export function Footer() {
  const { t } = useI18n();
  const localeHref = useLocaleHref();
  const year = new Date().getFullYear();
  const footerSections = [
    {
      title: t('catalog'),
      links: [
        { href: '/icons', label: t('navIcons') },
        { href: '/prayers', label: t('navPrayers') },
        { href: '/saints', label: t('navSaints') },
        { href: '/gospel', label: t('navGospel') }
      ]
    },
    {
      title: t('forChurches'),
      links: [
        { href: '/churches', label: t('navChurches') }
      ]
    }
  ];

  return (
    <footer className="site-footer">
      <div className="site-footer-main">
        <div className="site-footer-brand">
          <Link className="footer-logo-link" href={localeHref('/')} aria-label={t('home')}>
            <BrandLogo className="footer-logo" size={54} />
          </Link>
          <small>{t('portal')}</small>
          <strong>{t('brand')}</strong>
          <p>{t('footerText')}</p>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          {footerSections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.links.map((link) => <Link key={link.href} href={localeHref(link.href)}>{link.label}</Link>)}
            </section>
          ))}
        </nav>
      </div>

      <div className="site-footer-bottom">
        <span>{year} {t('brand')}</span>
        <Link href={localeHref('/')}>{t('home')}</Link>
      </div>
    </footer>
  );
}
