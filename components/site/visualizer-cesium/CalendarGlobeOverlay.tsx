'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpen,CalendarDays,ChevronLeft,ChevronRight,Church,Compass,Globe2,Layers,Map,MapPin,Menu,Minus,Plus,Search,Sun,UserRound,X} from 'lucide-react';
import * as C from '@cesium/engine';
import {useI18n} from '@/components/site/LanguageProvider';
import {BrandLogo} from '@/components/site/BrandLogo';
import {createOrthodoxCalendarLayer,setCalendarLighting} from '@/lib/cesium/calendar';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
import type {CalendarEntry} from '@/lib/church/calendar-entry';
import {calendarCopy} from './calendar-copy';
import styles from './calendar-globe.module.css';
import {useUnifiedLayers} from './useUnifiedLayers';
import {modeFromParams,initialLayers,layersForMode,layerCopy,type GlobeMode,type GlobeLayers} from '@/lib/cesium/unified';

type Details={id:string;title:string;summary:string;biography?:string;entityType:string;matchStatus:string;wikipedia:string|null;places:CalendarGeoItem[];
  image:{url:string;author:string;license:string;commonsPage:string}|null;
  sources:{url:string;type:string}[];relatedContent:{type:string;slug:string;title:string;language:string}[]};
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const offsetDate=(date:string,offset:number)=>{const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const external=(url:string|null)=>url?.startsWith('https://')?url:undefined;
const imageSource=(url:string)=>external(url)||(url.startsWith('/')&&!url.startsWith('//')?url:undefined);
const contentHref=(link:Details['relatedContent'][number])=>`/${link.language}/${link.type==='life'?'saints':link.type==='prayer'?'prayers':link.type==='icon'?'church/icons':'church/articles'}/${encodeURIComponent(link.slug)}`;

export function CalendarGlobeOverlay({widget}:{widget:C.CesiumWidget}) {
  const {locale,setLocale}=useI18n(),text=calendarCopy[locale];
  const [mode,setMode]=useState<GlobeMode>(()=>modeFromParams(new URLSearchParams(window.location.search)));
  const [visibility,setVisibility]=useState(()=>initialLayers(new URLSearchParams(window.location.search))),[layerPanel,setLayerPanel]=useState(false);
  const [date,setDate]=useState(()=>{const params=new URLSearchParams(window.location.search),value=params.get('date')??params.get('calendarDate');return value&&validDate(value)?value:today();});
  const [items,setItems]=useState<CalendarGeoItem[]>([]),[entries,setEntries]=useState<CalendarEntry[]>([]);
  const [selected,setSelected]=useState<string|null>(()=>new URLSearchParams(window.location.search).get('entity')),[loadedDetails,setDetails]=useState<Details|null>(null);
  const [drawer,setDrawer]=useState(()=>!['globe','map'].includes(mode)),[menu,setMenu]=useState(false),[query,setQuery]=useState('');
  const unified=useUnifiedLayers(widget,locale,visibility,selected,id=>{setSelected(id);setDetails(null);setDrawer(false);}),labels=layerCopy[locale];
  const baseSelection=!!selected&&/^(country|capital|city|event):/.test(selected);
  const details=baseSelection?unified.selectionDetails():loadedDetails;
  const [status,setStatus]=useState('loading'),[detailError,setDetailError]=useState(false),[retry,setRetry]=useState(0);
  const [mapMode,setMapMode]=useState(false),[sun,setSun]=useState(true);
  const layer=useRef<ReturnType<typeof createOrthodoxCalendarLayer>|null>(null);
  const entityVisibility=useRef<Record<string,boolean>>({});
  const refreshEntities=useRef(()=>{});
  const itemsRef=useRef(items),entryRef=useRef(entries);
  useEffect(()=>{itemsRef.current=items;entryRef.current=entries;},[items,entries]);
  useEffect(()=>{
    const instance=createOrthodoxCalendarLayer(widget,id=>{
      const entry=entityVisibility.current.calendar?entryRef.current.find(entry=>entry.entityId===id):null;
      setSelected(entry?'entry:'+entry.id:id);setDetails(current=>current?.id===id?current:null);setDetailError(false);setDrawer(false);
      instance.focus(itemsRef.current.filter(item=>item.entityId===id));
    },()=>setStatus('error'));
    layer.current=instance;
    const manager=unified.manager.current;
    manager.add({...instance,id:'entities'});
    for(const id of ['calendar','saints','churches','monasteries'])manager.add({id,kind:'event',setVisible(value){entityVisibility.current[id]=value;refreshEntities.current();},dispose(){}});
    return()=>{instance.dispose();layer.current=null;};
  },[widget,unified.manager]);
  useEffect(()=>{
    const controller=new AbortController();layer.current?.update([]);
    const load=async()=>{
      setStatus('loading');setItems([]);setEntries([]);setDetailError(false);
      try{
        const response=await fetch('/api/calendar/geo?'+new URLSearchParams({date,locale,calendarSystem:'julian',tradition:'orthodox'}),{signal:controller.signal});
        if(!response.ok)throw new Error('day');const payload=await response.json() as {items:CalendarGeoItem[];entries:CalendarEntry[]};
        if(!Array.isArray(payload.items)||!Array.isArray(payload.entries))throw new Error('day payload');
        if(!controller.signal.aborted){setItems(payload.items);setEntries(payload.entries);setStatus('ready');}
      }catch{if(!controller.signal.aborted)setStatus('error');}
    };void load();return()=>controller.abort();
  },[date,locale,retry]);
  const selectedId=baseSelection?null:selected?.startsWith('entry:')?entries.find(entry=>entry.id===selected.slice(6))?.entityId:selected;
  useEffect(()=>{
    refreshEntities.current=()=>{
      const flags=entityVisibility.current;
      const global=unified.catalog.items.filter(item=>(flags.saints&&['saint','feast','icon'].includes(item.entityType))||(flags.churches&&['church','shrine'].includes(item.entityType))||(flags.monasteries&&item.entityType==='monastery'));
      const visible=[...(flags.calendar?items:[]),...global];itemsRef.current=visible;
      layer.current?.update(visible,'all',selectedId??null);
    };refreshEntities.current();
  },[items,selectedId,unified.catalog.items]);
  useEffect(()=>{
    if(!selected||baseSelection)return;const controller=new AbortController(),isEntry=selected.startsWith('entry:');
    void fetch(`/api/calendar/${isEntry?'entry':'entity'}/${encodeURIComponent(isEntry?selected.slice(6):selected)}?locale=${locale}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('card');const data=await response.json() as Details;
      if(!Array.isArray(data.places)||!Array.isArray(data.sources)||!Array.isArray(data.relatedContent))throw new Error('card payload');
      if(!controller.signal.aborted)setDetails(data);
    }).catch(()=>{if(!controller.signal.aborted)setDetailError(true);});return()=>controller.abort();
  },[selected,locale,baseSelection]);
  useEffect(()=>{
    const url=new URL(window.location.href);url.searchParams.delete('view');url.searchParams.delete('engine');url.searchParams.delete('calendarDate');url.searchParams.set('mode',mode);url.searchParams.set('date',date);
    url.searchParams.set('layers',Object.entries(visibility).filter(([,value])=>value).map(([key])=>key).join(','));
    if(selected)url.searchParams.set('entity',selected);else url.searchParams.delete('entity');
    window.history.replaceState(window.history.state,'',url);
  },[date,mode,visibility,selected]);
  useEffect(()=>{const restore=()=>{const params=new URLSearchParams(window.location.search);setMode(modeFromParams(params));setVisibility(initialLayers(params));setSelected(params.get('entity'));const day=params.get('date')??params.get('calendarDate');if(day&&validDate(day))setDate(day);};window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSelected(null);setDetails(null);setDrawer(false);setMenu(false);}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[]);
  const format=(value:string,options:Intl.DateTimeFormatOptions={dateStyle:'long'})=>new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const switchMode=(next:GlobeMode)=>{setMode(next);setVisibility(current=>layersForMode(current,next));setDrawer(next!=='globe'&&next!=='map');setMenu(false);setLayerPanel(false);setSelected(null);setDetails(null);};
  const changeDate=(value:string)=>{if(validDate(value)){setDate(value);switchMode('calendar');}};
  const openEntry=(entry:CalendarEntry)=>{
    const key='entry:'+entry.id;if(selected!==key){setDetails(null);setDetailError(false);setSelected(key);}setDrawer(false);
    if(entry.hasGeo)layer.current?.focus(items.filter(item=>item.entityId===entry.entityId));else widget.camera.cancelFlight();
  };
  const closeCard=()=>{setSelected(null);setDetails(null);};
  const openDrawer=()=>{if(mode!=='calendar')switchMode('calendar');else setDrawer(value=>!value);setSelected(null);setDetails(null);setMenu(false);};
  const overview=()=>{widget.camera.cancelFlight();if(widget.scene.mode!==C.SceneMode.SCENE3D)widget.scene.morphTo3D(0);setMapMode(false);widget.camera.flyTo({destination:C.Cartesian3.fromDegrees(16,28,window.innerWidth<768?24000000:14000000),duration:1.5});};
  const zoom=(direction:number)=>{widget.camera.cancelFlight();const amount=Math.max(25,widget.camera.positionCartographic.height*.35);if(direction>0)widget.camera.zoomIn(amount);else widget.camera.zoomOut(amount);widget.scene.requestRender();};
  const firstPlace=details?.places[0],more=details?.relatedContent[0];
  const moreExternal=external(details?.wikipedia??null)||external(details?.sources.find(source=>source.type==='church_source')?.url??null);
  const categories=['saint','feast','icon','event'] as const;
  const filtered=entries.filter(entry=>entry.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const catalogEntries=unified.catalog.entries.filter(entry=>mode==='churches'?['church','monastery','shrine'].includes(entry.entityType):['saint','feast','icon'].includes(entry.entityType)).filter(entry=>entry.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  return <div className={styles.overlay} data-calendar-overlay data-mode={mode} data-selected={!!selected}>
    <a href={'/'+locale} className={styles.brand}><BrandLogo size={48}/><span><b>Svet Ikony</b><small>{text.tagline}</small></span></a>
    <nav className={`${styles.navigation} ${menu?styles.menuOpen:''}`} aria-label={text.menu}>
      <button data-mode-button="globe" aria-label={text.globe} title={text.globe} aria-current={mode==='globe'?'page':undefined} onClick={()=>switchMode('globe')}><Globe2/><span>{text.globe}</span></button>
      <button data-mode-button="calendar" aria-label={text.calendar} title={text.calendar} aria-current={mode==='calendar'?'page':undefined} onClick={()=>switchMode('calendar')}><CalendarDays/><span>{text.calendar}</span></button>
      <button data-mode-button="saints" aria-label={text.saints} title={text.saints} aria-current={mode==='saints'?'page':undefined} onClick={()=>switchMode('saints')}><UserRound/><span>{text.saints}</span></button>
      <button data-mode-button="churches" aria-label={text.churches} title={text.churches} aria-current={mode==='churches'?'page':undefined} onClick={()=>switchMode('churches')}><Church/><span>{text.churches}</span></button>
      <button data-mode-button="history" aria-label={text.history} title={text.history} aria-current={mode==='history'?'page':undefined} onClick={()=>switchMode('history')}><BookOpen/><span>{text.history}</span></button>
      <button data-mode-button="map" aria-label={text.map} title={text.map} aria-current={mode==='map'?'page':undefined} onClick={()=>switchMode('map')}><Map/><span>{text.map}</span></button>
    </nav>
    <div className={styles.dateBar}>
      <button className={styles.iconButton} aria-label={text.previous} title={text.previous} onClick={()=>changeDate(offsetDate(date,-1))}><ChevronLeft size={20}/></button>
      <label className={styles.dateLabel}><strong>{format(date)}</strong><small>{format(date,{weekday:'long'})} · {text.orthodox}</small><input type="date" aria-label={text.date} value={date} onChange={event=>changeDate(event.target.value)}/></label>
      <button className={styles.iconButton} aria-label={text.next} title={text.next} onClick={()=>changeDate(offsetDate(date,1))}><ChevronRight size={20}/></button>
    </div>
    <div className={styles.topActions}>
      <button className={`${styles.iconButton} ${styles.layersButton}`} title={labels.layers} aria-label={labels.layers} aria-expanded={layerPanel} onClick={()=>{setLayerPanel(value=>!value);setDrawer(false);}}><Layers size={19}/></button>
      <button className={styles.iconButton} title={text.search} aria-label={text.search} onClick={()=>{if(mode==='globe'||mode==='map')switchMode('saints');else setDrawer(true);setMenu(false);closeCard();}}><Search size={19}/></button>
      <button className={styles.today} onClick={()=>changeDate(today())}>{text.today}</button>
      <select aria-label="Language" value={locale} onChange={event=>setLocale(event.target.value as 'uk'|'ru'|'en')}><option value="uk">UK</option><option value="ru">RU</option><option value="en">EN</option></select>
      <button className={`${styles.iconButton} ${styles.menuButton}`} aria-label={text.menu} aria-expanded={menu} onClick={()=>setMenu(value=>!value)}><Menu size={24}/></button>
    </div>
    <button className={styles.dayToggle} aria-expanded={drawer} onClick={openDrawer}><CalendarDays size={16}/><span>{status==='ready'?`${entries.length} ${text.count}`:status==='error'?text.error:text.loading}</span><ChevronRight size={14}/></button>
    {layerPanel?<aside className={styles.layerPanel} aria-label={labels.layers}>{(Object.keys(visibility) as (keyof GlobeLayers)[]).map(id=><label key={id}><input type="checkbox" data-layer={id} checked={visibility[id]} disabled={id==='routes'} onChange={event=>setVisibility(current=>({...current,[id]:event.target.checked}))}/>{labels[id]}</label>)}</aside>:null}
    {unified.error?<output className={styles.layerError} role="alert">{unified.error}</output>:null}
    {drawer&&mode!=='calendar'?<aside className={styles.drawer} data-testid="mode-panel">
      <header><h2>{text[mode==='map'?'map':mode==='globe'?'globe':mode]}</h2><button className={styles.iconButton} aria-label={text.close} onClick={()=>setDrawer(false)}><X size={18}/></button></header>
      <label className={styles.search}><Search size={17}/><input aria-label={text.search} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className={styles.scrollArea}><ul>{mode==='history'?unified.events.filter(event=>event.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))).map(event=><li key={event.id}><button onClick={()=>{setSelected('event:'+event.id);setDrawer(false);}}>{event.title}<small>{event.displayDate}</small></button></li>):catalogEntries.map(entry=><li key={entry.id}><button onClick={()=>{setDetails(null);setSelected(entry.id);setDrawer(false);}}>{entry.title}{entry.hasGeo?<MapPin size={14}/>:null}</button></li>)}</ul>{(mode==='history'?!unified.events.length:!catalogEntries.length)?<p>{labels.empty}</p>:null}</div>
    </aside>:null}
    {drawer&&mode==='calendar'?<aside className={styles.drawer} aria-label={text.day} data-testid="calendar-day">
      <header><div><small>{text.day}</small><h2>{format(date)}</h2><span>{entries.length} {text.count}</span></div><button className={styles.iconButton} aria-label={text.close} onClick={()=>setDrawer(false)}><X size={18}/></button></header>
      <label className={styles.search}><Search size={17}/><input aria-label={text.search} placeholder={text.search} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className={styles.scrollArea}>
        {status==='loading'?<p role="status">{text.loading}</p>:status==='error'?<p role="alert">{text.error} <button onClick={()=>setRetry(value=>value+1)}>{text.retry}</button></p>:!filtered.length?<p>{text.empty}</p>:null}
        {categories.map(category=>{const group=filtered.filter(entry=>entry.entityType===category);return group.length?<section key={category}><h3>{text[category]} <small>{group.length}</small></h3><ul>{group.map(entry=><li key={entry.id}><button onClick={()=>openEntry(entry)}><span>{entry.title}</span>{entry.hasGeo?<MapPin size={14} aria-label={text.places}/>:null}<ChevronRight size={14}/></button></li>)}</ul></section>:null;})}
      </div>
    </aside>:null}
    {selected?<aside className={styles.detail} aria-label={details?.title??text.loading} data-testid="calendar-card">
      <header><span>{firstPlace?<><MapPin size={16}/>{firstPlace.placeTitle}</>:baseSelection?<><MapPin size={16}/>{details?.title}</>:<><CalendarDays size={16}/>{text.day}</>}</span><button className={styles.iconButton} aria-label={text.close} title={text.close} onClick={closeCard}><X size={20}/></button></header>
      {!details?<p role="status">{detailError?text.error:text.loading}</p>:<>
        {details.image&&imageSource(details.image.url)?<figure><img src={imageSource(details.image.url)} alt={details.title}/>{details.image.license?<figcaption>{details.image.author} · <a href={external(details.image.commonsPage)} target="_blank" rel="noreferrer">{details.image.license}</a></figcaption>:null}</figure>:null}
        <div className={styles.cardBody}>
          <h2>{details.title}</h2>
          {!baseSelection?<p className={styles.meta}>{firstPlace?`${firstPlace.lat.toFixed(4)}°, ${firstPlace.lon.toFixed(4)}°`:format(date)}</p>:null}
          <span className={styles.type}>{details.entityType==='country'?labels.countries:details.entityType==='capital'?labels.capitals:details.entityType==='city'?labels.cities:text[details.entityType as 'saint'|'feast'|'icon'|'event']??text.event}</span>
          {details.summary?<p className={styles.description}>{details.summary}</p>:null}
          {!firstPlace&&!baseSelection?<small className={styles.noPlace}>{text.noPlace}</small>:null}
          {details.biography?<details className={styles.life}><summary>{text.life}</summary><p>{details.biography}</p></details>:null}
          {firstPlace?<ul className={styles.places}>{details.places.map(place=><li key={place.placeId+place.relationType}><MapPin size={14}/><span>{place.placeTitle}<small>{text[place.relationType as 'birth'|'death'|'burial'|'residence']??place.relationType}</small></span></li>)}</ul>:null}
          {details.matchStatus==='machine_high'&&firstPlace?<small className={styles.noPlace}>{text.machine}</small>:null}
          <nav className={styles.related}>{details.relatedContent.map(link=><a key={link.type+link.slug} href={contentHref(link)}>{link.type==='life'?text.life:link.type==='prayer'?text.prayer:link.title}<ArrowRight size={15}/></a>)}</nav>
          {more||moreExternal?<a className={styles.primary} href={more?contentHref(more):moreExternal} target={more?undefined:'_blank'} rel={more?undefined:'noreferrer'}>{text.more}<ArrowRight size={18}/></a>:null}
          {details.sources.length?<details className={styles.sources}><summary>{text.sources}</summary>{details.sources.filter(source=>external(source.url)).map(source=><a key={source.url} href={external(source.url)} target="_blank" rel="noreferrer">{new URL(source.url).hostname.replace('www.','')}<ArrowRight size={12}/></a>)}</details>:null}
        </div>
      </>}
    </aside>:null}
    <div className={styles.cameraControls}>
      {mode==='map'?<button className={styles.roundButton} aria-label={mapMode?'3D':'2D'} onClick={()=>{if(mapMode)widget.scene.morphTo3D(1);else widget.scene.morphTo2D(1);setMapMode(!mapMode);}}>{mapMode?'3D':'2D'}</button>:null}
      <button className={styles.roundButton} title={text.north} aria-label={text.north} onClick={()=>widget.camera.flyTo({destination:widget.camera.positionWC.clone(),orientation:{heading:0,pitch:widget.camera.pitch,roll:0},duration:.8})}><Compass size={22}/></button>
      <button className={styles.roundButton} title={text.zoomIn} aria-label={text.zoomIn} onClick={()=>zoom(1)}><Plus size={24}/></button>
      <button className={styles.roundButton} title={text.zoomOut} aria-label={text.zoomOut} onClick={()=>zoom(-1)}><Minus size={24}/></button>
    </div>
    <button className={styles.overview} onClick={overview}><Globe2 size={18}/>{text.showAll}</button>
    <button className={styles.sunToggle} aria-label={text.sun} title={text.sun} aria-pressed={sun} onClick={()=>{setCalendarLighting(widget,!sun);setSun(!sun);}}><Sun size={20}/></button>
    {mode==='history'?<nav className={styles.timeline} aria-label={text.history}><label>{labels.year} <select value={unified.year} onChange={event=>unified.setYear(event.target.value)}><option value="">{labels.all}</option>{unified.years.map(year=><option key={year}>{year}</option>)}</select></label><span>{unified.events.length?`${unified.events.length} ${labels.events}`:labels.empty}</span></nav>:<nav className={styles.timeline} aria-label={text.calendar}>{[-2,-1,0,1,2].map(offset=>{const value=offsetDate(date,offset);return <button key={offset} aria-current={offset===0?'date':undefined} aria-label={format(value)} onClick={()=>changeDate(value)}><i/><span>{format(value,offset===0?{day:'numeric',month:'long'}:{day:'numeric',month:'short'})}</span></button>;})}</nav>}
  </div>;
}
