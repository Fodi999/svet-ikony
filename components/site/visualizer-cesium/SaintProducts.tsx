'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import type {ChurchProductDto} from '@/lib/types';
import {ProductOrderTrigger} from '../ProductOrderModal';
import {resolveMediaUrl} from '@/lib/media/resolver';
export function SaintProducts({groupId,locale}:{groupId:string|null;locale:'ru'|'uk'|'en'}){
 return <SaintProductList key={groupId??'unlinked'} groupId={groupId} locale={locale}/>;
}
function SaintProductList({groupId,locale}:{groupId:string|null;locale:'ru'|'uk'|'en'}){
 const [items,setItems]=useState<ChurchProductDto[]>([]),[selected,setSelected]=useState<ChurchProductDto|null>(null),[status,setStatus]=useState(groupId?'loading':'ready');
 const t={ru:{empty:'Связанные иконы пока не добавлены в каталог.',back:'Иконы Варвары',more:'Подробнее',error:'Не удалось загрузить товары.',available:'В наличии',order:'Под заказ',unavailable:'Нет в наличии'},uk:{empty:'Пов’язані ікони ще не додані до каталогу.',back:'Ікони Варвари',more:'Докладніше',error:'Не вдалося завантажити товари.',available:'У наявності',order:'На замовлення',unavailable:'Немає в наявності'},en:{empty:'No linked icons have been added to the catalog.',back:'Icons of Barbara',more:'Details',error:'Could not load products.',available:'Available',order:'Made to order',unavailable:'Unavailable'}}[locale];
 useEffect(()=>{if(!groupId)return;const controller=new AbortController();void fetch('/api/church/products?'+new URLSearchParams({linkedIconGroupId:groupId}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const data=await r.json() as ChurchProductDto[];if(!Array.isArray(data))throw Error();if(controller.signal.aborted)return;setItems(data.filter(p=>p.isActive&&p.linkedIconTranslationGroupId===groupId));setStatus('ready');}).catch(()=>{if(!controller.signal.aborted)setStatus('error');});return()=>controller.abort();},[groupId]);
 const name=(p:ChurchProductDto)=>locale==='ru'?p.nameRu||p.nameUk:locale==='en'?p.nameEn||p.nameUk:p.nameUk;
 const money=(p:ChurchProductDto)=>new Intl.NumberFormat(locale,{style:'currency',currency:p.currency}).format(p.priceCents/100);
 const stock=(p:ChurchProductDto)=>p.stockStatus==='available'?t.available:p.stockStatus==='made_to_order'?t.order:t.unavailable;
 if(status==='loading')return <p role="status">…</p>;
 if(status==='error')return <p role="alert">{t.error}</p>;
 if(selected)return <section><button onClick={()=>setSelected(null)}><ArrowLeft size={16}/>{t.back}</button>{selected.photoUrl?<img style={{width:'100%',height:220,objectFit:'contain'}} src={resolveMediaUrl(selected.photoUrl)} alt={name(selected)}/>:null}<h3>{name(selected)}</h3><p>{(locale==='ru'?selected.fullDescriptionRu:locale==='en'?selected.fullDescriptionEn:selected.fullDescriptionUk)||selected.description}</p><strong>{money(selected)}</strong><p>{stock(selected)}</p>{['available','made_to_order'].includes(selected.stockStatus)?<ProductOrderTrigger product={selected} related={[]}/>:null}</section>;
 return items.length?<div>{items.map(p=><article key={p.id}>{p.photoUrl?<img style={{width:'100%',height:180,objectFit:'contain'}} src={resolveMediaUrl(p.photoUrl)} alt={name(p)}/>:null}<h3>{name(p)}</h3><p>{p.description}</p><strong>{money(p)}</strong><p>{stock(p)}</p><button onClick={()=>setSelected(p)}>{t.more}</button></article>)}</div>:<p>{t.empty}</p>;
}
