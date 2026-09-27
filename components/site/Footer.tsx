'use client';

import Link from 'next/link';
import {BrandLogo} from './BrandLogo';
import {useI18n,useLocaleHref} from './LanguageProvider';
import {siteShellCopy} from './site-shell-copy';
import styles from './site-shell.module.css';

export function Footer(){
  const {locale}=useI18n(),href=useLocaleHref(),text=siteShellCopy[locale];
  return <footer className={styles.footer}>
    <a href={href('/')}><BrandLogo size={30}/><span>Svet Ikony</span></a>
    <nav aria-label={text.navigation}>
      <Link href={href('/about')}>{text.about}</Link>
      <Link href={href('/shop')}>{text.collection}</Link>
      <Link href={href('/explore')}>{text.library}</Link>
      <Link href={href('/churches')}>{text.churches}</Link>
    </nav>
    <span>© {new Date().getFullYear()} Svet Ikony</span>
  </footer>;
}
