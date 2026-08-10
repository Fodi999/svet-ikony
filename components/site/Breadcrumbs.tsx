'use client';

import Link from 'next/link';
import { useLocaleHref } from './LanguageProvider';
import { SvgIcon } from './SvgIcon';

export type BreadcrumbItem = {
  href: string;
  label: string;
};

export function Breadcrumbs({ items, current }: { items: BreadcrumbItem[]; current: string }) {
  const localeHref = useLocaleHref();
  return (
    // "breadcrumbs" carries no styling of its own anymore, kept as a
    // structural marker: prayer-mode.css's .sacred-read-page .breadcrumbs
    // still targets it via a descendant selector (phase 7 territory).
    <nav className="breadcrumbs" aria-label={current}>
      <ol className="flex flex-wrap items-center gap-1.5 mt-0 mx-0 mb-4.5 p-0 list-none text-[12px] font-bold tracking-[.08em] uppercase text-[#8f9b86]">
        {items.map((item) => (
          <li key={item.href} className="inline-flex items-center gap-1.5 min-w-0">
            <Link className="text-gold-light no-underline hover:text-gold hover:underline" href={localeHref(item.href)}>
              {item.label}
            </Link>
            <SvgIcon name="arrow-right" size={12} className="shrink-0 opacity-60" />
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 min-w-0" aria-current="page">
          <span className="inline-block max-w-[46ch] overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">{current}</span>
        </li>
      </ol>
    </nav>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  const localeHref = useLocaleHref();
  return (
    <Link
      className="inline-flex items-center gap-2 mt-2 text-[13px] font-black tracking-[.06em] text-gold-light no-underline hover:text-gold hover:underline"
      href={localeHref(href)}
    >
      <SvgIcon name="arrow-left" size={16} />
      {label}
    </Link>
  );
}
