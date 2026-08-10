'use client';

import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';
import { useLocaleHref } from './LanguageProvider';
import { SvgIcon } from './SvgIcon';

type AssetButtonProps = {
  children: ReactNode;
  href?: string;
  download?: string;
  icon?: ReactNode;
  variant?: 'light' | 'dark';
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function DownloadIcon() {
  return <SvgIcon name="download" size={16} />;
}

export function CopyIcon() {
  return <SvgIcon name="copy" size={16} />;
}

// "asset-button" carries no styling of its own anymore (fully replaced by the
// Tailwind utilities below) but is kept as a structural marker: content.css
// (.detail-actions) and prayer-mode.css (.prayer-mode-hero) still target it
// via descendant selectors from LocalizedContent.tsx's kept markers.
const sharedButtonClass =
  "asset-button inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4.5 text-[13px] font-black tracking-[.06em] uppercase leading-[1.15] text-center no-underline whitespace-nowrap cursor-pointer border transition-[border-color,background,color,transform] duration-[180ms] ease-brand max-[900px]:w-full max-[430px]:min-h-[42px] max-[430px]:px-3 max-[430px]:text-[12px] max-[430px]:whitespace-normal";

export function AssetButton({ children, href, download, icon, variant = 'light', type = 'button', ariaLabel, target, rel, onClick }: AssetButtonProps) {
  const localeHref = useLocaleHref();
  const className = `${sharedButtonClass} ${
    variant === 'dark'
      ? 'border-gold/28 bg-gold/8 text-gold-light hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas'
      : 'border-gold bg-[linear-gradient(180deg,#e9cb84,#cda45a)] text-canvas hover:border-gold-light hover:bg-gold-light hover:text-canvas focus-visible:border-gold-light focus-visible:bg-gold-light focus-visible:text-canvas'
  }`;
  const content = (
    <>
      <span className="size-4 inline-grid place-items-center empty:hidden">{icon}</span>
      <span className="min-w-0 block overflow-hidden text-ellipsis">{children}</span>
    </>
  );

  if (href && (download || target || /^https?:\/\//i.test(href))) {
    return <a className={className} href={href} download={download} target={target} rel={rel} aria-label={ariaLabel}>{content}</a>;
  }

  if (href) {
    return <Link className={className} href={localeHref(href)} aria-label={ariaLabel}>{content}</Link>;
  }

  return <button className={className} type={type} onClick={onClick} aria-label={ariaLabel}>{content}</button>;
}
