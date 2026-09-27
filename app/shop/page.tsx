import {Hreflang} from '@/components/site/Hreflang';
import {ShopCatalog} from '@/components/site/ShopCatalog';
import {siteShellCopy} from '@/components/site/site-shell-copy';
import styles from '@/components/site/site-shell.module.css';
import {publicApi} from '@/lib/api';
import {pageMetadata} from '@/lib/seo';
import {getRequestLocale} from '@/lib/serverLocale';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function generateMetadata(){const locale=await getRequestLocale(),text=siteShellCopy[locale];return pageMetadata({title:text.collection,description:text.collectionLead,path:'/shop',locale});}
export default async function ShopPage(){const locale=await getRequestLocale(),text=siteShellCopy[locale];const [products,categories]=await Promise.all([publicApi.products(),publicApi.productCategories()]);return <main className={styles.page}><Hreflang locale={locale} path="/shop"/><h1>{text.collection}</h1><p className={styles.lead}>{text.collectionLead}</p><ShopCatalog products={products} categories={categories}/></main>;}
