'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { stripLocaleFromPathname } from '@/lib/i18n';
import { BrandLogo } from './BrandLogo';
import { LanguageSwitch, useI18n, useLocaleHref } from './LanguageProvider';

const nav = [
  ['navIcons', '/icons'],
  ['navShop', '/shop'],
  ['navPrayers', '/prayers'],
  ['navSaints', '/saints'],
  ['navGospel', '/gospel'],
  ['navChurches', '/churches'],
  ['navAlphabet', '/staroslavyanskaya-azbuka']
] as const;

function navLinkClass(isActive: boolean) {
  return `inline-flex min-h-[38px] items-center border border-transparent rounded-full px-3.5 text-[14px] font-extrabold leading-none no-underline whitespace-nowrap transition-colors duration-[180ms] ease-brand hover:bg-[rgba(214,168,79,.1)] hover:text-foreground focus-visible:bg-[rgba(214,168,79,.1)] focus-visible:text-foreground max-[1040px]:flex-none max-[900px]:[scroll-snap-align:start] max-[640px]:min-h-[36px] max-[640px]:px-[11px] max-[640px]:text-[13px] max-[430px]:min-h-[34px] max-[430px]:px-2.5 max-[430px]:text-[12px] ${
    isActive ? 'border-gold-light bg-gold-light text-canvas' : 'text-muted-foreground'
  }`;
}

export function Header() {
  const { t } = useI18n();
  const localeHref = useLocaleHref();
  const pathname = usePathname();
  const currentPath = stripLocaleFromPathname(pathname || '/');

  return (
    <header className="sticky top-2.5 z-[1000] w-[calc(100%-clamp(24px,4vw,72px))] max-w-[1840px] min-h-0 mt-2.5 mx-auto grid grid-cols-[minmax(270px,360px)_minmax(0,1fr)_auto] items-center gap-[clamp(14px,2.4vw,34px)] py-[5px] px-[clamp(16px,4vw,48px)] border border-[rgba(232,211,169,.13)] rounded-[8px] bg-[rgba(11,12,10,.94)] text-foreground shadow-[0_6px_18px_rgba(0,0,0,.18)] [backdrop-filter:blur(18px)_saturate(1.08)] overflow-clip isolate max-[1040px]:grid-cols-[minmax(170px,1fr)_auto] max-[1040px]:gap-x-3.5 max-[1040px]:gap-y-2.5 max-[900px]:grid-cols-[minmax(0,1fr)_auto] max-[900px]:pt-1.5 max-[900px]:px-3 max-[900px]:pb-2 max-[640px]:w-[calc(100%-12px)] max-[640px]:mt-1.5 max-[640px]:min-h-auto max-[640px]:py-1 max-[640px]:px-2.5 max-[640px]:gap-2.5 max-[430px]:grid-cols-[minmax(0,1fr)_auto] max-[430px]:gap-x-2.5 max-[430px]:gap-y-2 max-[430px]:py-2 max-[430px]:px-2.5 [@media(display-mode:standalone)]:w-[calc(100%-max(12px,env(safe-area-inset-left))-max(12px,env(safe-area-inset-right)))] [@media(display-mode:standalone)]:mt-[max(6px,env(safe-area-inset-top))]">
      <Link
        className="relative min-w-0 w-max inline-flex items-center gap-3 text-foreground no-underline max-[900px]:max-w-full max-[900px]:gap-[9px] max-[430px]:gap-2"
        href={localeHref('/')}
      >
        <span className="relative grid place-items-center size-[58px] flex-[0_0_58px] overflow-hidden max-[900px]:w-[54px] max-[900px]:h-[54px] max-[900px]:flex-[0_0_58px] max-[640px]:size-[48px] max-[640px]:flex-[0_0_48px] max-[430px]:size-[42px] max-[430px]:flex-[0_0_42px]">
          <BrandLogo className="block w-full h-full object-contain opacity-100" size={58} />
        </span>
        <span className="min-w-0 grid gap-[3px] max-[900px]:overflow-hidden">
          <small className="text-muted-foreground text-[10px] font-black tracking-[.16em] leading-none uppercase max-[640px]:hidden">{t('portal')}</small>
          <b className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-foreground font-serif text-[19px] font-bold tracking-[.01em] leading-none max-[900px]:max-w-[min(28vw,190px)] max-[900px]:text-[17px] max-[640px]:max-w-[min(34vw,150px)] max-[640px]:text-[clamp(14px,3.8vw,17px)] max-[430px]:max-w-[min(32vw,130px)] max-[430px]:text-[clamp(13px,4vw,16px)]">
            {t('brand')}
          </b>
        </span>
      </Link>
      <nav
        className="min-w-0 w-max max-w-full justify-self-center inline-flex items-center justify-center gap-1 border border-[rgba(232,211,169,.13)] rounded-full p-1 bg-[rgba(5,5,5,.18)] max-[1040px]:col-span-full max-[1040px]:row-start-2 max-[1040px]:w-full max-[1040px]:justify-self-stretch max-[1040px]:justify-start max-[1040px]:overflow-x-auto max-[1040px]:[scrollbar-width:none] max-[1040px]:[&::-webkit-scrollbar]:hidden max-[430px]:mx-0 max-[430px]:p-[3px] max-[430px]:gap-0.5"
        aria-label={t('catalog')}
      >
        {nav.map(([label, href]) => {
          const active = currentPath === href || currentPath.startsWith(`${href}/`);
          return (
            <Link key={href} className={navLinkClass(active)} href={localeHref(href)}>
              {t(label)}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 inline-flex items-center justify-end gap-2.5 max-[1040px]:col-start-2 max-[1040px]:row-start-1 max-[1040px]:self-center max-[430px]:gap-2 max-[430px]:justify-self-end">
        <LanguageSwitch />
        <Link
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-gold/28 bg-gold/8 px-4 text-[13px] font-black tracking-[.06em] text-gold-light uppercase leading-[1.15] no-underline whitespace-nowrap cursor-pointer transition-[border-color,background,color,transform] duration-[180ms] ease-brand hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas max-[900px]:hidden"
          href={localeHref('/churches')}
        >
          {t('forChurches')}
        </Link>
      </div>
    </header>
  );
}
