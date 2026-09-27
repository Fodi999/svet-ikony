import Link from 'next/link';
import {ArrowUpRight,BookOpen,CalendarDays,ImageIcon,Languages,ScrollText,UserRound} from 'lucide-react';
import {getRequestLocale} from '@/lib/serverLocale';
import {withLocale} from '@/lib/i18n';
import {shellMetadata} from '@/lib/shell-metadata';
import {publicApi} from '@/lib/api';
import {StableImage} from '@/components/site/StableImage';
import {Hreflang} from '@/components/site/Hreflang';
import {siteShellCopy} from '@/components/site/site-shell-copy';
import styles from '@/components/site/site-shell.module.css';
export async function generateMetadata(){const locale=await getRequestLocale();return shellMetadata('/explore',locale);}
export default async function ExplorePage(){
 const locale=await getRequestLocale(),text=siteShellCopy[locale];
 const [icons,prayers]=await Promise.all([publicApi.icons(locale),publicApi.prayers(locale)]);
 const image=icons.find(icon=>icon.imageUrl)?.imageUrl;
 const prayerImage=prayers.find(prayer=>prayer.imageUrl)?.imageUrl;
 const sections=[{key:'icons',url:'/icons',icon:ImageIcon},{key:'saints',url:'/saints',icon:UserRound},{key:'prayers',url:'/prayers',icon:ScrollText},{key:'gospel',url:'/gospel',icon:BookOpen},{key:'alphabet',url:'/staroslavyanskaya-azbuka',icon:Languages},{key:'calendar',url:'/?mode=calendar',icon:CalendarDays}] as const;
 return <main className={styles.page}><Hreflang locale={locale} path="/explore"/><h1>{text.library}</h1><p className={styles.lead}>{text.libraryLead}</p><div className={styles.libraryGrid}>{sections.map(({key,url,icon:Icon})=>{const preview=key==='icons'?image:key==='prayers'?prayerImage:undefined;return <Link key={key} href={withLocale(url,locale)} className={styles.libraryCard}>{preview?<figure><StableImage src={preview} alt={text[key]} width={144} height={144}/></figure>:<figure className={styles.librarySymbol}><Icon size={32} strokeWidth={1.4}/></figure>}<div><span>{text[key]}</span><ArrowUpRight size={20}/></div></Link>})}</div></main>;
}
