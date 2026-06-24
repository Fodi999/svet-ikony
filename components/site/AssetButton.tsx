'use client';

import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

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
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 4v10" />
      <path d="m7.5 10 4.5 4.5L16.5 10" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5H18a2.5 2.5 0 0 1 2.5 2.5V15A2.5 2.5 0 0 1 18 17.5h-7.5A2.5 2.5 0 0 1 8 15V7.5Z" />
      <path d="M5.5 8.5V18A2.5 2.5 0 0 0 8 20.5h9.5" />
    </svg>
  );
}

export function AssetButton({ children, href, download, icon, variant = 'light', type = 'button', ariaLabel, target, rel, onClick }: AssetButtonProps) {
  const className = `asset-button${variant === 'dark' ? ' asset-button-dark' : ''}`;
  const content = <><span className="asset-button-icon">{icon}</span><span className="asset-button-label">{children}</span></>;

  if (href && (download || target || /^https?:\/\//i.test(href))) {
    return <a className={className} href={href} download={download} target={target} rel={rel} aria-label={ariaLabel}>{content}</a>;
  }

  if (href) {
    return <Link className={className} href={href} aria-label={ariaLabel}>{content}</Link>;
  }

  return <button className={className} type={type} onClick={onClick} aria-label={ariaLabel}>{content}</button>;
}
