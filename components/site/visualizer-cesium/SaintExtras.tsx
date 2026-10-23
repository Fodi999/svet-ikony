'use client';
import {useEffect,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import styles from './calendar-globe.module.css';
import {SaintProducts} from './SaintProducts';

// DB-driven saint extras for the generic globe card: the inline prayer (with
// audio), linked collectible icons and a jump to the next commemoration.
// Everything comes from what the admin linked (calendar_geo_content_links,
// church_prayers.icon_id, calendar_geo_occurrences) -- nothing is hardcoded
// per saint.
type Link={type:string;slug:string;language:string;groupId?:string};
type Prayer={text:string;audioUrl?:string;language:string;source?:string};
const copy={
 uk:{prayer:'Молитва',icons:'Ікони',calendar:'Показати в календарі',loading:'Завантаження молитви…',error:'Молитва недоступна.',original:'Мова оригіналу'},
 ru:{prayer:'Молитва',icons:'Иконы',calendar:'Показать в календаре',loading:'Загрузка молитвы…',error:'Молитва недоступна.',original:'Язык оригинала'},
 en:{prayer:'Prayer',icons:'Icons',calendar:'Show in calendar',loading:'Loading prayer…',error:'Prayer unavailable.',original:'Original language'},
};
export function nextCommemoration(dates:string[],today:string){
 const sorted=dates.filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
 return sorted.find(date=>date>=today)??sorted.at(-1)??null;
}
export function SaintExtras({locale,related,commemorations,onCalendar}:{locale:'uk'|'ru'|'en';related:Link[];commemorations:{date:string}[];onCalendar:(date:string)=>void}){
 const t=copy[locale];
 const prayerLink=related.find(link=>link.type==='prayer')??null;
 const [prayer,setPrayer]=useState<Prayer|null>(null),[prayerIcon,setPrayerIcon]=useState<string|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  if(!prayerLink)return;const controller=new AbortController();
  void fetch(`/api/church/prayers/${encodeURIComponent(prayerLink.slug)}?language=${prayerLink.language}`,{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error('prayer');const data=await response.json() as {prayer?:Prayer|null;icon?:{translationGroupId?:string}|null};
   if(!data?.prayer?.text)throw new Error('prayer');
   if(!controller.signal.aborted){setPrayer(data.prayer);setPrayerIcon(data.icon?.translationGroupId??null);}
  }).catch(()=>{if(!controller.signal.aborted)setError(true);});
  return()=>controller.abort();
 },[prayerLink]);
 const iconGroup=related.find(link=>link.type==='icon')?.groupId??prayerIcon;
 const next=nextCommemoration(commemorations.map(item=>item.date),new Date().toISOString().slice(0,10));
 return <>
  {next?<button type="button" className={styles.today} onClick={()=>onCalendar(next)}><CalendarDays size={15}/> {t.calendar}</button>:null}
  {prayerLink?<details className={styles.life} data-testid="saint-prayer"><summary>{t.prayer}</summary>
   {prayer?<>{prayer.language!==locale?<small>{t.original}: {prayer.language}</small>:null}<p>{prayer.text}</p>
    {prayer.audioUrl&&/^https:\/\//.test(prayer.audioUrl)?<audio controls preload="none" src={prayer.audioUrl} style={{width:'100%'}}/>:null}
    {prayer.source?<small>{prayer.source}</small>:null}</>:<p role="status">{error?t.error:t.loading}</p>}
  </details>:null}
  {iconGroup?<details className={styles.life} data-testid="saint-icons"><summary>{t.icons}</summary><SaintProducts groupId={iconGroup} locale={locale}/></details>:null}
 </>;
}
