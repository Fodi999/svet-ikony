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

  const navLinkClass =
    "text-foreground text-[15px] font-bold leading-[1.25] no-underline transition-colors duration-[180ms] ease-brand hover:text-gold-light focus-visible:text-gold-light max-[430px]:text-[14px]";

  return (
    <footer className="relative z-[2] isolate py-0 px-[clamp(18px,5vw,72px)] border-t border-[rgba(232,211,169,.13)] bg-canvas text-foreground max-[900px]:px-4 max-[430px]:px-3">
      <div className="grid grid-cols-[minmax(260px,.9fr)_minmax(320px,1.1fr)] gap-[clamp(28px,6vw,96px)] py-[clamp(42px,6vw,78px)] max-[900px]:grid-cols-1 max-[900px]:gap-[30px] max-[900px]:py-[34px] max-[430px]:gap-6 max-[430px]:py-7">
        <div className="max-w-[560px] grid content-start gap-3">
          <Link
            className="relative size-[54px] grid place-items-center overflow-hidden"
            href={localeHref('/')}
            aria-label={t('home')}
          >
            <BrandLogo className="block w-full h-full object-contain opacity-100" size={54} />
          </Link>
          <small className="block text-gold-light text-[12px] font-black tracking-[.14em] uppercase">{t('portal')}</small>
          <strong className="block max-w-[620px] text-foreground font-serif text-[clamp(30px,3.4vw,58px)] font-bold leading-[1.05] text-balance max-[430px]:text-[clamp(26px,8vw,38px)] max-[430px]:leading-[1.08]">
            {t('brand')}
          </strong>
          <p className="max-w-[520px] m-0 text-muted-foreground font-serif text-[clamp(17px,1.4vw,22px)] leading-[1.5] max-[430px]:text-[16px]">
            {t('footerText')}
          </p>
        </div>

        <nav className="relative grid grid-cols-2 gap-[clamp(18px,3vw,42px)] content-start max-[900px]:grid-cols-1 max-[900px]:gap-[22px] max-[430px]:gap-[18px]" aria-label="Footer">
          {footerSections.map((section) => (
            <section
              key={section.title}
              className="min-w-0 grid content-start gap-2.5 border-l border-l-[rgba(232,211,169,.13)] pl-[clamp(16px,2vw,28px)] max-[900px]:pl-4 max-[430px]:pl-3"
            >
              <h2 className="mt-0 mx-0 mb-2 text-gold-light text-[12px] font-black tracking-[.14em] uppercase">{section.title}</h2>
              {section.links.map((link) => (
                <Link key={link.href} className={navLinkClass} href={localeHref(link.href)}>
                  {link.label}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      </div>

      <div className="min-h-[58px] flex items-center justify-between gap-4.5 border-t border-t-[rgba(232,211,169,.13)] text-muted-foreground text-[12px] font-extrabold tracking-[.08em] uppercase max-[900px]:items-start max-[900px]:flex-col max-[900px]:justify-center max-[900px]:py-4 max-[430px]:min-h-0 max-[430px]:gap-2.5 max-[430px]:py-3.5 max-[430px]:text-[11px] max-[430px]:tracking-[.04em]">
        <span>{year} {t('brand')}</span>
        <Link
          className="text-muted-foreground text-[12px] font-bold leading-[1.25] no-underline transition-colors duration-[180ms] ease-brand hover:text-gold-light focus-visible:text-gold-light"
          href={localeHref('/')}
        >
          {t('home')}
        </Link>
      </div>
    </footer>
  );
}
