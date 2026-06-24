'use client';

import Link from 'next/link';
import { useI18n } from './LanguageProvider';

export function Footer() {
  const { t } = useI18n();
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
        { href: '/churches', label: t('navChurches') },
        { href: '/p/pravoslavnaya-ikona-s-qr-kodom', label: t('seoPage') },
        { href: '/qr/home-001', label: t('qrExample') }
      ]
    }
  ];

  return (
    <footer className="site-footer">
      <div className="site-footer-main">
        <div className="site-footer-brand">
          <span className="footer-cross">☦</span>
          <small>{t('portal')}</small>
          <strong>{t('brand')}</strong>
          <p>{t('footerText')}</p>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          {footerSections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
            </section>
          ))}
        </nav>
      </div>

      <div className="site-footer-bottom">
        <span>© {year} {t('brand')}</span>
        <Link href="/">{t('home')}</Link>
      </div>
    </footer>
  );
}
