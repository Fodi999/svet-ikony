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

export function AssetButton({ children, href, download, icon, variant = 'light', type = 'button', ariaLabel, target, rel, onClick }: AssetButtonProps) {
  const localeHref = useLocaleHref();
  const className = `asset-button${variant === 'dark' ? ' asset-button-dark' : ''}`;
  const content = <><span className="asset-button-icon">{icon}</span><span className="asset-button-label">{children}</span></>;

  if (href && (download || target || /^https?:\/\//i.test(href))) {
    return <a className={className} href={href} download={download} target={target} rel={rel} aria-label={ariaLabel}>{content}</a>;
  }

  if (href) {
    return <Link className={className} href={localeHref(href)} aria-label={ariaLabel}>{content}</Link>;
  }

  return <button className={className} type={type} onClick={onClick} aria-label={ariaLabel}>{content}</button>;
}
