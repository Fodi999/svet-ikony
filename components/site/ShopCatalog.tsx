'use client';
import {useMemo,useState} from 'react';
import {Search} from 'lucide-react';
import type {ChurchProductCategoryDto,ChurchProductDto} from '@/lib/types';
import {useI18n} from './LanguageProvider';
import {ProductCard} from './ProductCard';
import {siteShellCopy} from './site-shell-copy';
import styles from './collection.module.css';
const normalized=(text:string)=>text.toLowerCase().replace(/ё/g,'е').trim();
export function ShopCatalog({products,categories}:{products:ChurchProductDto[];categories:ChurchProductCategoryDto[]}){
 const {locale,t}=useI18n(),text=siteShellCopy[locale];
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[sort,setSort]=useState('default');
 const name=(item:{nameUk:string;nameRu:string;nameEn:string})=>locale==='ru'?item.nameRu||item.nameUk:locale==='en'?item.nameEn||item.nameUk:item.nameUk;
 const rows=useMemo(()=>{
  const search=normalized(query);
  const result=products.filter(product=>(category==='all'||product.categoryId===category)&&normalized([product.nameUk,product.nameRu,product.nameEn,product.description,product.slug].join(' ')).includes(search));
  return sort==='default'?result:result.sort((a,b)=>a.currency.localeCompare(b.currency)||(sort==='asc'?a.priceCents-b.priceCents:b.priceCents-a.priceCents));
 },[query,category,sort,products]);
 return <section className={styles.catalog}>
  <div className={styles.filters}><label className={styles.search}><Search size={18}/><input type="search" aria-label={t('productSearchPlaceholder')} placeholder={t('productSearchPlaceholder')} value={query} onChange={e=>setQuery(e.target.value)}/></label><label><span>{t('section')}</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">{t('allSections')}</option>{categories.map(item=><option key={item.id} value={item.id}>{name(item)}</option>)}</select></label><label><span>{text.sort}</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="default">{text.defaultSort}</option><option value="asc">{text.priceAsc}</option><option value="desc">{text.priceDesc}</option></select></label></div>
  <p className={styles.count} aria-live="polite">{text.found}: {rows.length}</p>
  {rows.length?<div className={styles.grid}>{rows.map(product=><ProductCard key={product.id} product={product}/>)}</div>:<p className={styles.empty}>{t('noProductsFound')}</p>}
 </section>;
}
