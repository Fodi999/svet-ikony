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
    <nav className="breadcrumbs" aria-label={current}>
      <ol>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={localeHref(item.href)}>{item.label}</Link>
            <SvgIcon name="arrow-right" size={12} />
          </li>
        ))}
        <li aria-current="page"><span>{current}</span></li>
      </ol>
    </nav>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  const localeHref = useLocaleHref();
  return (
    <Link className="back-link" href={localeHref(href)}>
      <SvgIcon name="arrow-left" size={16} />
      {label}
    </Link>
  );
}
