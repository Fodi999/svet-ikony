'use client';

import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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
  className?: string;
};

export function DownloadIcon() {
  return <SvgIcon name="download" size={16} />;
}

export function CopyIcon() {
  return <SvgIcon name="copy" size={16} />;
}

export function AssetButton({ children, href, download, icon, variant = 'light', type = 'button', ariaLabel, target, rel, onClick, className }: AssetButtonProps) {
  const localeHref = useLocaleHref();
  const content = (
    <>
      <span className="size-4 inline-grid place-items-center empty:hidden">{icon}</span>
      <span className="min-w-0 block overflow-hidden text-ellipsis">{children}</span>
    </>
  );

  if (href && (download || target || /^https?:\/\//i.test(href))) {
    return (
      <Button
        variant={variant}
        size="asset"
        className={className}
        render={<a href={href} download={download} target={target} rel={rel} aria-label={ariaLabel} />}
      >
        {content}
      </Button>
    );
  }

  if (href) {
    return (
      <Button variant={variant} size="asset" className={className} render={<Link href={localeHref(href)} aria-label={ariaLabel} />}>
        {content}
      </Button>
    );
  }

  return (
    <Button variant={variant} size="asset" className={className} type={type} onClick={onClick} aria-label={ariaLabel}>
      {content}
    </Button>
  );
}
