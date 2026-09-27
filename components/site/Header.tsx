'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {BookOpen,Church,Globe2,Info,Layers,Menu,X} from 'lucide-react';
import {stripLocaleFromPathname} from '@/lib/i18n';
import {BrandLogo} from './BrandLogo';
import {useI18n,useLocaleHref} from './LanguageProvider';
import {siteShellCopy} from './site-shell-copy';
import styles from './site-shell.module.css';

export function Header(){
 const {locale,setLocale}=useI18n(),href=useLocaleHref(),pathname=usePathname();
 const text=siteShellCopy[locale],path=stripLocaleFromPathname(pathname||'/');
 const [open,setOpen]=useState(false),toggle=useRef<HTMLButtonElement>(null),panel=useRef<HTMLElement>(null);
 const active=path==='/'||path==='/earth'||path==='/pravoslavna-istoriya'?'planet':path.startsWith('/shop')?'collection':['/explore','/icons','/saints','/prayers','/gospel','/staroslavyanskaya-azbuka','/church/'].some(p=>path.startsWith(p))?'library':null;
 const links=[{key:'planet',url:'/',icon:Globe2},{key:'collection',url:'/shop',icon:Layers},{key:'library',url:'/explore',icon:BookOpen}] as const;
 // Entering Cesium needs a new document: client navigation retains the library's stricter CSP.
 useEffect(()=>{const close=()=>setOpen(false);window.addEventListener('popstate',close);return()=>window.removeEventListener('popstate',close);},[]);
 useEffect(()=>{
  if(!open)return;
  panel.current?.querySelector<HTMLElement>('a')?.focus();
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus();}if(event.key==='Tab'){const nodes=[toggle.current,...Array.from(panel.current?.querySelectorAll<HTMLElement>('a,button,select')??[])].filter(Boolean) as HTMLElement[];const index=nodes.indexOf(document.activeElement as HTMLElement);event.preventDefault();nodes[(index+(event.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();}};
  document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
 },[open]);
 return <><header data-site-header data-unified-header className={styles.header}>
  <a className={styles.brand} href={href('/')}><BrandLogo size={38}/><span>Svet Ikony</span></a>
  <nav className={styles.primaryNav} aria-label={text.navigation}>{links.map(({key,url,icon:Icon})=>{const NavigationLink=key==='planet'?'a':Link;return <NavigationLink key={key} href={href(url)} aria-current={active===key?'page':undefined}><Icon size={17}/>{text[key]}</NavigationLink>;})}</nav>
  <div className={styles.actions}><select aria-label={text.language} value={locale} onChange={event=>setLocale(event.target.value as 'ru'|'uk'|'en')}><option value="uk">UK</option><option value="ru">RU</option><option value="en">EN</option></select>{active!=='planet'?<button ref={toggle} className={styles.menuToggle} aria-label={open?text.close:text.menu} aria-expanded={open} aria-controls="site-menu" onClick={()=>setOpen(value=>!value)}>{open?<X size={22}/>:<Menu size={22}/>}</button>:null}</div>
  {open&&active!=='planet'?<><button className={styles.scrim} aria-label={text.close} tabIndex={-1} onClick={()=>setOpen(false)}/><nav id="site-menu" ref={panel} className={styles.menu} aria-label={text.menu}>
   {links.map(({key,url,icon:Icon})=>{const NavigationLink=key==='planet'?'a':Link;return <NavigationLink key={key} href={href(url)} onClick={()=>setOpen(false)} aria-current={active===key?'page':undefined}><Icon size={20}/>{text[key]}</NavigationLink>;})}
   <hr/><Link href={href('/about')} onClick={()=>setOpen(false)}><Info size={20}/>{text.about}</Link><Link href={href('/churches')} onClick={()=>setOpen(false)}><Church size={20}/>{text.churches}</Link>
  </nav></>:null}
 </header><nav className={styles.mobileNav} aria-label={text.navigation}>{links.map(({key,url,icon:Icon})=>{const NavigationLink=key==='planet'?'a':Link;return <NavigationLink key={key} href={href(url)} data-active={active===key} onClick={()=>setOpen(false)}><Icon size={20}/><span>{text[key]}</span></NavigationLink>;})}</nav></>;
}
