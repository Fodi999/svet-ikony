'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,X,MapPin} from 'lucide-react';
import type {CesiumWidget} from '@cesium/engine';
import {useI18n} from '@/components/site/LanguageProvider';
import {createOrthodoxCalendarLayer} from '@/lib/cesium/calendar';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
import type {CalendarEntry} from '@/lib/church/calendar-entry';
import styles from './calendar.module.css';
type Details={id:string;title:string;summary:string;biography?:string;entityType:string;matchStatus:string;wikipedia:string|null;places:CalendarGeoItem[];
  image:{url:string;author:string;license:string;commonsPage:string}|null;
  sources:{url:string;type:string}[];relatedContent:{type:string;slug:string;title:string;language:string}[]};
const labels={uk:{today:'Сьогодні',all:'Усі',saint:'Святі',feast:'Свята',icon:'Ікони',event:'Події',holy_place:'Святі місця',places:'Пов’язані місця',close:'Закрити',previous:'Попередній день',next:'Наступний день',date:'Дата',filter:'Категорія',loading:'Завантаження',empty:'Немає підтверджених місць',error:'Не вдалося завантажити',life:'Житіє',prayer:'Молитва'},
  ru:{today:'Сегодня',all:'Все',saint:'Святые',feast:'Праздники',icon:'Иконы',event:'События',holy_place:'Святые места',places:'Связанные места',close:'Закрыть',previous:'Предыдущий день',next:'Следующий день',date:'Дата',filter:'Категория',loading:'Загрузка',empty:'Нет подтверждённых мест',error:'Не удалось загрузить',life:'Житие',prayer:'Молитва'},
  en:{today:'Today',all:'All',saint:'Saints',feast:'Feasts',icon:'Icons',event:'Events',holy_place:'Holy places',places:'Related places',close:'Close',previous:'Previous day',next:'Next day',date:'Date',filter:'Category',loading:'Loading',empty:'No confirmed places',error:'Could not load',life:'Life',prayer:'Prayer'}};
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const external=(url:string|null)=>url?.startsWith('https://')?url:undefined;
const imageSource=(url:string)=>external(url)||(url.startsWith('/')&&!url.startsWith('//')?url:undefined);
const relations={uk:{birth:'Народження',death:'Смерть',burial:'Поховання',residence:'Проживання',machine:'Автоматичне зіставлення'},ru:{birth:'Рождение',death:'Смерть',burial:'Погребение',residence:'Проживание',machine:'Автоматическое сопоставление'},en:{birth:'Birth',death:'Death',burial:'Burial',residence:'Residence',machine:'Machine-matched'}};
/** Deprecated standalone overlay; the local route uses the unified globe shell. */
export function CalendarOverlay({widget}:{widget:CesiumWidget}) {
  const {locale}=useI18n(),text=labels[locale];
  const [date,setDate]=useState(()=>{const value=new URLSearchParams(window.location.search).get('calendarDate');return value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:today();});
  const [filter,setFilter]=useState('all'),[items,setItems]=useState<CalendarGeoItem[]>([]),[selected,setSelected]=useState<string|null>(null);
  const [details,setDetails]=useState<Details|null>(null),[status,setStatus]=useState('loading');
  const [entries,setEntries]=useState<CalendarEntry[]>([]),[detailError,setDetailError]=useState(false);
  const dayText={uk:{day:'Пам’яті дня',count:'пам’ятей',noGeo:'Без географічної прив’язки'},ru:{day:'Памяти дня',count:'памятей',noGeo:'Без географической привязки'},en:{day:'Day commemorations',count:'commemorations',noGeo:'No geographic location'}}[locale];
  const layer=useRef<ReturnType<typeof createOrthodoxCalendarLayer>|null>(null);
  useEffect(()=>{const instance=createOrthodoxCalendarLayer(widget,id=>{setSelected(id);setDetails(current=>current?.id===id?current:null);setDetailError(false);},()=>setStatus('error'));layer.current=instance;return()=>{instance.dispose();layer.current=null;};},[widget]);
  useEffect(()=>{
    const controller=new AbortController();
    layer.current?.update([]);
    const load=async()=>{
      setStatus('loading');setItems([]);setEntries([]);setSelected(null);setDetails(null);setDetailError(false);
      try{const result=await fetch(`/api/calendar/geo?${new URLSearchParams({date,locale,calendarSystem:'julian',tradition:'orthodox'})}`,{signal:controller.signal});
        if(!result.ok)throw new Error('geo');const payload=await result.json() as {items:CalendarGeoItem[];entries:CalendarEntry[]};
        if(!Array.isArray(payload?.items)||!Array.isArray(payload.entries))throw new Error('geo payload');
        if(!controller.signal.aborted){setItems(payload.items);setEntries(payload.entries);setStatus('ready');}
      }catch{if(!controller.signal.aborted)setStatus('error');}
    };void load();return()=>controller.abort();
  },[date,locale]);
  useEffect(()=>{layer.current?.update(items,filter);},[items,filter]);
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();
    const isEntry=selected.startsWith('entry:');
    void fetch(`/api/calendar/${isEntry?'entry':'entity'}/${encodeURIComponent(isEntry?selected.slice(6):selected)}?locale=${locale}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('details');const data=await response.json() as Details;
      if(typeof data?.id!=='string'||!Array.isArray(data.places)||!Array.isArray(data.sources)||!Array.isArray(data.relatedContent))throw new Error('details payload');
      if(!controller.signal.aborted)setDetails(data);
    }).catch(()=>{if(!controller.signal.aborted)setDetailError(true);});
    return()=>controller.abort();
  },[selected,locale]);
  const shift=(offset:number)=>{const value=new Date(`${date}T12:00:00Z`);if(!Number.isFinite(value.getTime()))return;value.setUTCDate(value.getUTCDate()+offset);setDate(value.toISOString().slice(0,10));};
  const openEntry=(entry:CalendarEntry)=>{if(selected!==`entry:${entry.id}`){setDetails(null);setDetailError(false);setSelected(`entry:${entry.id}`);}layer.current?.focus(items.filter(item=>item.entityId===entry.entityId));};
  return <>
    <div className={styles.controls}>
      <button aria-label={text.previous} title={text.previous} onClick={()=>shift(-1)}><ChevronLeft size={18}/></button>
      <input type="date" aria-label={text.date} value={date} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/>
      <button aria-label={text.next} title={text.next} onClick={()=>shift(1)}><ChevronRight size={18}/></button>
      <button onClick={()=>setDate(today())}>{text.today}</button>
      <select aria-label={text.filter} value={filter} onChange={event=>setFilter(event.target.value)}>{(['all','saint','feast','icon','event','holy_place'] as const).map(key=><option key={key} value={key}>{text[key]}</option>)}</select>
      {status!=='ready'?<output aria-live="polite">{text[status as 'loading'|'empty'|'error']}</output>:null}
    </div>
    <aside className={`${styles.day} ${selected?styles.dayBehind:''}`} aria-label={dayText.day} data-testid="calendar-day">
      <header><strong>{new Intl.DateTimeFormat(locale,{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))}</strong><output aria-live="polite">{entries.length} {dayText.count}</output></header>
      {(['saint','feast','icon','event'] as const).filter(category=>filter==='all'||filter===category).map(category=>{
        const group=entries.filter(entry=>entry.entityType===category);
        return group.length?<section key={category}><h3>{text[category]} <small>{group.length}</small></h3><ul>{group.map(entry=><li key={entry.id}><button onClick={()=>openEntry(entry)} aria-pressed={selected===`entry:${entry.id}`}><span>{entry.title}</span>{entry.hasGeo?<MapPin size={14} aria-label={text.places}/>:null}</button></li>)}</ul></section>:null;
      })}
    </aside>
    {selected&&!details?<aside className={styles.detail} aria-live="polite"><button aria-label={text.close} onClick={()=>{setSelected(null);setDetailError(false);}}><X size={18}/></button><p>{detailError?text.error:text.loading}</p></aside>:null}
    {details&&selected?<aside className={styles.detail} aria-label={details.title}>
      <header><h3>{details.title}</h3><button aria-label={text.close} title={text.close} onClick={()=>{setSelected(null);setDetails(null);}}><X size={18}/></button></header>
      {details.image&&imageSource(details.image.url)?<figure><img src={imageSource(details.image.url)} alt={details.title}/>{details.image.license?<figcaption>{details.image.author} · <a href={external(details.image.commonsPage)} target="_blank" rel="noreferrer">{details.image.license}</a></figcaption>:null}</figure>:null}
      <time dateTime={date}>{new Intl.DateTimeFormat(locale,{dateStyle:'long'}).format(new Date(`${date}T12:00:00Z`))}</time>
      <small>{text[details.entityType as 'saint'|'feast'|'icon'|'event']??text.event}</small>
      {details.matchStatus==='machine_high'?<small>{relations[locale].machine}</small>:null}
      <p>{details.summary}</p>
      {details.biography?<details><summary>{text.life}</summary><p className={styles.biography}>{details.biography}</p></details>:null}
      {!details.places.length?<p>{dayText.noGeo}</p>:null}
      <ul>{details.places.map(place=><li key={`${place.placeId}:${place.relationType}`}>{place.placeTitle} · {relations[locale][place.relationType as 'birth'|'death'|'burial'|'residence']??place.relationType}<small>{place.lat.toFixed(4)}, {place.lon.toFixed(4)} · {place.geoStatus==='machine_high'?relations[locale].machine:place.geoStatus}</small></li>)}</ul>
      <nav>
        {details.relatedContent.map(link=><a key={`${link.type}:${link.slug}`} href={`/${link.language}/${link.type==='life'?'saints':link.type==='prayer'?'prayers':link.type==='icon'?'church/icons':'church/articles'}/${encodeURIComponent(link.slug)}`}>{link.type==='life'?text.life:link.type==='prayer'?text.prayer:link.title}</a>)}
        {details.places.length?<button onClick={()=>{layer.current?.focus(items.filter(item=>item.entityId===details.id));}}><MapPin size={16}/>{text.places}</button>:null}
        {external(details.wikipedia)?<a href={external(details.wikipedia)} target="_blank" rel="noreferrer">Wikipedia</a>:null}
      </nav>
      <footer>{details.sources.map(source=><a key={source.url} href={external(source.url)} target="_blank" rel="noreferrer">{source.type}</a>)}</footer>
    </aside>:null}
  </>;
}
