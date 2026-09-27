'use client';
import {useEffect,useState} from 'react';
import {Globe2} from 'lucide-react';
import type {PlaceCollectionItem,SacredPlaceMarker} from '@/lib/d1/repositories/calendarGeoPlaces';
import {useI18n,useLocaleHref} from './LanguageProvider';
import {siteShellCopy} from './site-shell-copy';
import styles from './collection.module.css';

const cache=new Map<string,Promise<Map<string,SacredPlaceMarker[]>>>();
/** Reverse the existing public collection links. No inferred place/icon matches or writes.
 * Shared between product navigations, with at most three collection reads in flight. */
function index(locale:string){
 const cached=cache.get(locale);if(cached)return cached;
 const request=(async()=>{
  const response=await fetch(`/api/calendar/places?bbox=-180,-90,180,90&locale=${locale}`);if(!response.ok)throw Error('places');
  const places=(await response.json() as SacredPlaceMarker[]).filter(place=>place.hasCollection),result=new Map<string,SacredPlaceMarker[]>();let next=0;
  await Promise.all(Array.from({length:Math.min(3,places.length)},async()=>{while(next<places.length){const place=places[next++],r=await fetch(`/api/calendar/place/${encodeURIComponent(place.id)}/collection?locale=${locale}`);if(!r.ok)throw Error('collection');const data=await r.json() as {items:PlaceCollectionItem[]};for(const product of data.items)result.set(product.id,[...(result.get(product.id)??[]),place]);}}));
  return result;
 })();cache.set(locale,request);void request.catch(()=>cache.delete(locale));return request;
}
export function ProductPlaceLink({productId}:{productId:string}){
 const {locale}=useI18n(),href=useLocaleHref(),text=siteShellCopy[locale],key=locale+productId;
 const [result,setState]=useState<{key:string;places:SacredPlaceMarker[];status:'loading'|'ready'|'error'}>({key,places:[],status:'loading'});
 const state=result.key===key?result:{key,places:[],status:'loading'};
 useEffect(()=>{let active=true;void index(locale).then(data=>{if(active)setState({key,places:data.get(productId)??[],status:'ready'});},()=>{if(active)setState({key,places:[],status:'error'});});return()=>{active=false;};},[locale,productId,key]);
 return <section className={styles.placeLink} aria-label={text.relatedPlace}><strong>{text.relatedPlace}</strong>{state.status==='loading'?<p role="status">…</p>:state.status==='error'?<p role="alert">{{ru:'Не удалось загрузить связанные места.',uk:'Не вдалося завантажити пов’язані місця.',en:'Could not load associated places.'}[locale]}</p>:state.places.length?state.places.map(place=><a key={place.id} href={href(`/?place=${encodeURIComponent(place.id)}&tab=collection&mode=globe`)}><Globe2 size={18}/><span>{place.title} · {text.onPlanet}</span></a>):<p>{text.noPlace}</p>}</section>;
}
