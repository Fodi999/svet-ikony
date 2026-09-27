import Link from 'next/link';
import {getRequestLocale} from '@/lib/serverLocale';
import {withLocale} from '@/lib/i18n';
import {shellMetadata} from '@/lib/shell-metadata';
import {Hreflang} from '@/components/site/Hreflang';
import {siteShellCopy} from '@/components/site/site-shell-copy';
import styles from '@/components/site/site-shell.module.css';
export async function generateMetadata(){const locale=await getRequestLocale();return shellMetadata('/about',locale);}
export default async function AboutPage(){const locale=await getRequestLocale(),text=siteShellCopy[locale];return <main className={styles.page}><Hreflang locale={locale} path="/about"/><h1>{text.about}</h1><section className={styles.about}><p>{text.aboutText}</p><p>{text.aboutNote}</p></section><nav className={styles.sectionLinks}><Link href={withLocale('/',locale)}>{text.planet}</Link><Link href={withLocale('/shop',locale)}>{text.collection}</Link><Link href={withLocale('/explore',locale)}>{text.library}</Link><Link href={withLocale('/churches',locale)}>{text.churches}</Link></nav></main>;}
