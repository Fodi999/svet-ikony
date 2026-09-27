'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpen,CalendarDays,ChevronLeft,ChevronRight,Church,Compass,Globe2,Layers,Map,MapPin,Minus,Plus,Search,UserRound,X} from 'lucide-react';
import * as C from '@cesium/engine';
import {useI18n} from '@/components/site/LanguageProvider';
import {siteShellCopy} from '@/components/site/site-shell-copy';
import {createOrthodoxCalendarLayer,setCalendarLighting} from '@/lib/cesium/calendar';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
import type {CalendarEntry} from '@/lib/church/calendar-entry';
import {calendarCopy} from './calendar-copy';
import styles from './calendar-globe.module.css';
import {useUnifiedLayers} from './useUnifiedLayers';
import {modeFromParams,readLayers,layerStorageKey,layersForMode,layerCopy,placeFromParams,tabFromParams,type GlobeMode,type GlobeLayers,type PlaceTab} from '@/lib/cesium/unified';
import {sacredDemo} from '@/lib/cesium/sacred-demo';
import {christianPlaces,christianCopy,chessIcon,chessModel,sacredPlaceItem} from '@/lib/cesium/christian-places';
import {countryMetadata} from '@/lib/visualizer/countries';
import {EarthSourceControl} from './EarthSourceControl';
import {BarbaraPanel} from './BarbaraPanel';
import {useMarkerImages} from './useMarkerImages';
import {markerFallback} from '@/lib/cesium/photo-marker';
import type {EarthStreaming} from '@/lib/cesium/earth-streaming';
import {createSacredPlacesLayer,type TerritoryFeature} from '@/lib/cesium/sacred-places';
import type {SacredPlaceMarker,PlaceProfile} from '@/lib/d1/repositories/calendarGeoPlaces';
import {SacredPlacePanel} from './SacredPlacePanel';
import {SacredPlotPanel} from './SacredPlotPanel';
import type {SacredPlot} from '@/lib/cesium/sacred-plots';
// Sacred Plots pilot scope (ТЗ п.1): only Kyiv-Pechersk Lavra gets a hex
// grid for now -- see lib/cesium/sacred-plots-layer.ts's setTerritory().

type Details={id:string;title:string;summary:string;biography?:string;entityType:string;matchStatus:string;wikipedia:string|null;places:CalendarGeoItem[];
  image:{url:string;author:string;license:string;commonsPage:string}|null;
  sources:{url:string;type:string}[];relatedContent:{type:string;slug:string;title:string;language:string}[]};
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const offsetDate=(date:string,offset:number)=>{const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const external=(url:string|null)=>url?.startsWith('https://')?url:undefined;
const imageSource=(url:string)=>external(url)||(url.startsWith('/')&&!url.startsWith('//')?url:undefined);
const contentHref=(link:Details['relatedContent'][number])=>`/${link.language}/${link.type==='life'?'saints':link.type==='prayer'?'prayers':link.type==='icon'?'church/icons':'church/articles'}/${encodeURIComponent(link.slug)}`;

export function CalendarGlobeOverlay({widget,earth=null}:{widget:C.CesiumWidget;earth?:EarthStreaming|null}) {
  const markerImages=useMarkerImages();
  const {locale}=useI18n(),text=calendarCopy[locale],shell=siteShellCopy[locale];
  const [demo]=useState(()=>sacredDemo(new URLSearchParams(window.location.search),window.location.hostname));
  const [mode,setMode]=useState<GlobeMode>(()=>modeFromParams(new URLSearchParams(window.location.search)));
  const [visibility,setVisibility]=useState(()=>readLayers(new URLSearchParams(window.location.search))),[layerPanel,setLayerPanel]=useState(false);
  const [date,setDate]=useState(()=>{const params=new URLSearchParams(window.location.search),value=params.get('date')??params.get('calendarDate');return value&&validDate(value)?value:today();});
  const [items,setItems]=useState<CalendarGeoItem[]>(()=>demo?.items??[]),[entries,setEntries]=useState<CalendarEntry[]>([]);
  const [selected,setSelected]=useState<string|null>(()=>new URLSearchParams(window.location.search).get('entity')),[loadedDetails,setDetails]=useState<Details|null>(null);
  const [drawer,setDrawer]=useState(()=>!['globe','map'].includes(mode)),[menu,setMenu]=useState(false),[query,setQuery]=useState('');
  const [placeId,setPlaceId]=useState<string|null>(()=>placeFromParams(new URLSearchParams(window.location.search)));
  const unified=useUnifiedLayers(widget,locale,visibility,selected,id=>{setSelected(id);setDetails(null);setDrawer(false);setPlaceId(null);}),labels={...layerCopy[locale],...christianCopy[locale]};
  const sacred=christianPlaces.find(place=>`place:${place.id}`===selected);
  const baseSelection=!!selected&&/^(country|capital|city|event):/.test(selected);
  const fixture=demo?.items.find(item=>item.entityId===selected);
  const details:Details|null=sacred?{id:`place:${sacred.id}`,title:sacred.name[locale],summary:sacred.description[locale],entityType:sacred.type,matchStatus:sacred.verifiedAnchor?'reviewed_verified':'editorial_demo',wikipedia:sacred.source,places:[sacredPlaceItem(sacred,locale)],image:sacred.imageUrl?{url:sacred.imageUrl,author:'',license:'',commonsPage:''}:null,sources:[{type:'editorial_source',url:sacred.source},...(sacred.coordinateSource?[{type:'coordinates',url:sacred.coordinateSource}]:[])],relatedContent:sacred.prayerSlug?[{type:'prayer',slug:sacred.prayerSlug,title:locale==='ru'?'Молитва и аудио':locale==='uk'?'Молитва й аудіо':'Prayer and audio',language:locale}]:[]}:fixture?{id:fixture.entityId,title:fixture.title,summary:'Local visual test fixture. Not a calendar record.',entityType:fixture.entityType,matchStatus:'local_fixture',wikipedia:null,places:[fixture],image:null,sources:[],relatedContent:[]}:baseSelection?unified.selectionDetails():loadedDetails;
  const [status,setStatus]=useState(demo?'ready':'loading'),[detailError,setDetailError]=useState(false),[retry,setRetry]=useState(0);
  const [mapMode,setMapMode]=useState(false),[sun,setSun]=useState(true);
  const layer=useRef<ReturnType<typeof createOrthodoxCalendarLayer>|null>(null);
  const placesLayer=useRef<ReturnType<typeof createOrthodoxCalendarLayer>|null>(null);
  const [placeError,setPlaceError]=useState('');
  // Sacred Place pilot (calendar_geo_place_*, D1-backed): its own always-on
  // Cesium layer + URL state (place/tab), independent of the christianPlaces
  // chess-marker demo layer above and of the entity-based `selected` state --
  // see lib/cesium/sacred-places.ts's header comment. Uses `placeId` (not
  // `place`) to avoid any confusion with `selected==='place:<id>'`, which is
  // the unrelated christianPlaces convention.
  const sacredLayer=useRef<ReturnType<typeof createSacredPlacesLayer>|null>(null);
  const focusedSacredPlace=useRef<string|null>(null);
  // Sacred Plots pilot selection state -- deliberately separate from
  // `placeId` (a Sacred Place) since a plot and a place are different
  // selection concepts with their own right-side panel; see the mutual
  // exclusion in selectPlace.current below and in the panel render.
  const [selectedPlot,setSelectedPlot]=useState<SacredPlot|null>(null);
  const [sacredPlaces,setSacredPlaces]=useState<SacredPlaceMarker[]>([]);
  const sacredPlacesRef=useRef<SacredPlaceMarker[]>(sacredPlaces);
  useEffect(()=>{sacredPlacesRef.current=sacredPlaces;},[sacredPlaces]);
  const [placeTab,setPlaceTab]=useState<PlaceTab>(()=>tabFromParams(new URLSearchParams(window.location.search)));
  // Single entry point for "a place got selected" -- territory-polygon
  // click, sacred-marker click, and hierarchy navigation (and, later, a 3D
  // object click) all resolve here. Kept as a ref (reassigned every render,
  // reading sacredPlacesRef for a fresh SacredPlaceMarker list) so the
  // widget-scoped effect that wires up createSacredPlacesLayer can call it
  // without needing sacredPlaces in its own dependency array.
  const selectPlace=useRef<(id:string,options?:{push?:boolean})=>void>(()=>{});
  useEffect(()=>{selectPlace.current=(id,options)=>{
    const place=sacredPlacesRef.current.find(item=>item.id===id);
    const tab:PlaceTab=place?.hasCollection?'collection':'about';
    if(options?.push){
      const url=new URL(window.location.href);
      url.searchParams.set('place',id);url.searchParams.set('tab',tab);
      window.history.pushState(window.history.state,'',url);
    }
    setPlaceId(id);setPlaceTab(tab);setSelected(null);setDetails(null);setDrawer(false);setMenu(false);
    setSelectedPlot(null);sacredLayer.current?.selectPlot(null);
  };},[]);
  useEffect(()=>{
    const instance=createOrthodoxCalendarLayer(widget,id=>{setSelected(id);setDetails(null);setDrawer(false);setPlaceId(null);setSelectedPlot(null);setLayerPanel(false);},error=>setPlaceError(String(error)),{
      name:'ChristianPlaces',farDistance:30_000_000,
      model:item=>{const place=christianPlaces.find(place=>place.id===item.placeId);return place&&!place.imageUrl?chessModel(place.markerType):undefined;},
      icon:(item,active)=>chessIcon(christianPlaces.find(place=>place.id===item.placeId)?.markerType??'pawn',active),
    });
    placesLayer.current=instance;
    unified.manager.current.add({...instance,id:'christianPlaces'});
    unified.manager.current.add({id:'sacredModels',kind:'event',setVisible(){},dispose(){}});
    return()=>{instance.dispose();placesLayer.current=null;};
  },[widget,unified.manager]);
  useEffect(()=>{
    placesLayer.current?.update(christianPlaces.map(place=>sacredPlaceItem(place,locale)),'all',selected,visibility.sacredModels);
    placesLayer.current?.setVisible(visibility.christianPlaces);
  },[locale,selected,visibility.sacredModels,visibility.christianPlaces]);
  useEffect(()=>{
    const instance=createSacredPlacesLayer(widget,id=>selectPlace.current(id),plot=>{
      // Sacred Plot hex click (ТЗ п.4/п.7): clears any place/entity selection
      // and opens SacredPlotPanel instead -- mirrors selectPlace.current's
      // own "clear entity selection" step above, in the other direction.
      setPlaceId(null);setSelected(null);setDetails(null);setDrawer(false);setMenu(false);
      setSelectedPlot(plot);
    },error=>console.error('[sacred-places]',error));
    sacredLayer.current=instance;
    return()=>{instance.dispose();sacredLayer.current=null;};
  },[widget]);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/calendar/places?bbox=-180,-90,180,90&locale='+locale,{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('places');return response.json() as Promise<SacredPlaceMarker[]>;})
      .then(async data=>{
        if(controller.signal.aborted)return;
        setSacredPlaces(data);
        const withTerritory=data.filter(item=>item.hasTerritory);
        const features=(await Promise.all(withTerritory.map(async item=>{
          try{
            const response=await fetch(`/api/calendar/place/${encodeURIComponent(item.id)}/profile?locale=${locale}`,{signal:controller.signal});
            if(!response.ok)return null;
            const profile=await response.json() as PlaceProfile;
            return profile.territory?{placeId:item.id,geometry:profile.territory.geometry as TerritoryFeature['geometry']}:null;
          }catch{return null;}
        }))).filter((feature):feature is TerritoryFeature=>feature!==null);
        if(!controller.signal.aborted){
          void sacredLayer.current?.setTerritories(features);
        }
      })
      .catch(()=>{});
    return()=>controller.abort();
  },[locale]);
  // Retired pilot grid: a selected object now owns a single visual footprint.
  useEffect(()=>{sacredLayer.current?.setPlotsVisible(false);},[widget]);
  useEffect(()=>{sacredLayer.current?.update(sacredPlaces,placeId);},[sacredPlaces,placeId]);
  useEffect(()=>{sacredLayer.current?.setVisible(visibility.christianPlaces||visibility.churches||visibility.monasteries);},[visibility.christianPlaces,visibility.churches,visibility.monasteries]);
  useEffect(()=>{
    if(!placeId){focusedSacredPlace.current=null;return;}
    if(focusedSacredPlace.current===placeId)return;
    const target=sacredPlaces.find(item=>item.id===placeId);
    if(!target)return;
    focusedSacredPlace.current=placeId;
    sacredLayer.current?.focus(target);
  },[placeId,sacredPlaces]);
  const entityVisibility=useRef<Record<string,boolean>>({});
  const refreshEntities=useRef(()=>{});
  const itemsRef=useRef(items),entryRef=useRef(entries);
  useEffect(()=>{itemsRef.current=items;entryRef.current=entries;},[items,entries]);
  useEffect(()=>{
    const instance=createOrthodoxCalendarLayer(widget,id=>{
      const entry=entityVisibility.current.calendar?entryRef.current.find(entry=>entry.entityId===id):null;
      setSelected(entry?'entry:'+entry.id:id);setDetails(current=>current?.id===id?current:null);setDetailError(false);setDrawer(false);setPlaceId(null);
      // Picking an already visible marker must not fly away from its near model.
    },()=>setStatus('error'));
    layer.current=instance;
    const manager=unified.manager.current;
    manager.add({...instance,id:'entities'});
    for(const id of ['calendar','saints','churches','monasteries'])manager.add({id,kind:'event',setVisible(value){entityVisibility.current[id]=value;refreshEntities.current();},dispose(){}});
    return()=>{instance.dispose();layer.current=null;};
  },[widget,unified.manager]);
  useEffect(()=>{
    if(demo)return;
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
  },[date,locale,retry,demo]);
  const selectedId=baseSelection?null:selected?.startsWith('entry:')?entries.find(entry=>entry.id===selected.slice(6))?.entityId:selected;
  const publishedImage=markerImages.find(row=>row.entityId===selectedId);
  useEffect(()=>{
    refreshEntities.current=()=>{
      const flags=entityVisibility.current;
      const global=unified.catalog.items.filter(item=>(flags.saints&&['saint','feast','icon'].includes(item.entityType))||(flags.churches&&['church','shrine'].includes(item.entityType))||(flags.monasteries&&item.entityType==='monastery'));
      const visible=(demo?demo.items:[...(flags.calendar?items:[]),...global]).map(item=>{
        const image=markerImages.find(row=>row.entityId===item.entityId);
        return image?{...item,thumbnail:image.markerKey?'/'+image.markerKey:null,imageVerified:!!image.markerKey}:item;
      });itemsRef.current=visible;
      layer.current?.update(visible,'all',selectedId??null,visibility.sacredModels);
    };refreshEntities.current();
  },[items,selectedId,unified.catalog.items,demo,visibility.sacredModels,markerImages]);
  useEffect(()=>{
    if(!selected||baseSelection||selected.startsWith('place:'))return;const controller=new AbortController(),isEntry=selected.startsWith('entry:');
    if(demo?.items.some(item=>item.entityId===selected))return;
    void fetch(`/api/calendar/${isEntry?'entry':'entity'}/${encodeURIComponent(isEntry?selected.slice(6):selected)}?locale=${locale}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('card');const data=await response.json() as Details;
      if(!Array.isArray(data.places)||!Array.isArray(data.sources)||!Array.isArray(data.relatedContent))throw new Error('card payload');
      if(!controller.signal.aborted)setDetails(data);
    }).catch(()=>{if(!controller.signal.aborted)setDetailError(true);});return()=>controller.abort();
  },[selected,locale,baseSelection,demo]);
  useEffect(()=>{
    const url=new URL(window.location.href);url.searchParams.delete('view');url.searchParams.delete('engine');url.searchParams.delete('calendarDate');url.searchParams.set('mode',mode);url.searchParams.set('date',date);
    url.searchParams.set('layers',Object.entries(visibility).filter(([,value])=>value).map(([key])=>key).join(','));
    if(selected&&!selectedPlot)url.searchParams.set('entity',selected);else url.searchParams.delete('entity');
    if(placeId){url.searchParams.set('place',placeId);url.searchParams.set('tab',placeTab);}else{url.searchParams.delete('place');url.searchParams.delete('tab');}
    window.history.replaceState(window.history.state,'',url);
    try{window.localStorage.setItem(layerStorageKey,JSON.stringify(visibility));}catch{/* Storage may be unavailable in private browsing. */}
  },[date,mode,visibility,selected,selectedPlot,placeId,placeTab]);
  useEffect(()=>{const restore=()=>{const params=new URLSearchParams(window.location.search);setMode(modeFromParams(params));setVisibility(readLayers(params));setSelected(params.get('entity'));const day=params.get('date')??params.get('calendarDate');if(day&&validDate(day))setDate(day);setPlaceId(placeFromParams(params));setPlaceTab(tabFromParams(params));setSelectedPlot(null);sacredLayer.current?.selectPlot(null);};window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSelected(null);setDetails(null);setDrawer(false);setLayerPanel(false);setMenu(false);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[]);
  const format=(value:string,options:Intl.DateTimeFormatOptions={dateStyle:'long'})=>new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const switchMode=(next:GlobeMode)=>{setMode(next);setVisibility(current=>layersForMode(current,next));setDrawer(next!=='globe'&&next!=='map');setMenu(false);setLayerPanel(false);setSelected(null);setDetails(null);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);};
  const changeDate=(value:string)=>{if(validDate(value)){setDate(value);setMode('calendar');setDrawer(true);setMenu(false);setLayerPanel(false);setSelected(null);setDetails(null);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);}};
  const openEntry=(entry:CalendarEntry)=>{
    const key='entry:'+entry.id;if(selected!==key){setDetails(null);setDetailError(false);setSelected(key);}setDrawer(false);
    if(entry.hasGeo)layer.current?.focus(items.filter(item=>item.entityId===entry.entityId));else widget.camera.cancelFlight();
  };
  const closeCard=()=>{setSelected(null);setDetails(null);};
  useEffect(()=>{
    if(selected!=='place:barbara-kyiv')return;
    const frame=requestAnimationFrame(()=>{
      if(widget.isDestroyed())return;
      const point=C.SceneTransforms.worldToWindowCoordinates(widget.scene,C.Cartesian3.fromDegrees(30.508719,50.444939));
      if(!point)return;
      const width=widget.canvas.clientWidth,height=widget.canvas.clientHeight;
      const fov=(widget.camera.frustum instanceof C.PerspectiveFrustum?widget.camera.frustum.fov:undefined)??Math.PI/3;
      if(window.innerWidth>=768&&point.x>width-440)widget.camera.lookRight(Math.min(.35,(point.x-(width-470))/width*fov));
      else if(window.innerWidth<768&&point.y>height*.48)widget.camera.lookDown(Math.min(.35,(point.y-height*.42)/height*fov));
      widget.scene.requestRender();
    });return()=>cancelAnimationFrame(frame);
  },[selected,widget]);
  const closePlot=()=>{setSelectedPlot(null);sacredLayer.current?.selectPlot(null);};
  // Place-to-place hierarchy navigation (SacredPlacePanel's parent/child
  // links, calendar_geo_place_relations). Pushes a new history entry (unlike
  // every other place/tab change, which the sync effect folds into the
  // current entry via replaceState) so Back can step from child to parent.
  const navigateToPlace=(nextPlaceId:string)=>selectPlace.current(nextPlaceId,{push:true});
  const openDrawer=()=>{if(mode!=='calendar')switchMode('calendar');else setDrawer(value=>!value);setSelected(null);setDetails(null);setMenu(false);};
  const overview=()=>{widget.camera.cancelFlight();if(widget.scene.mode!==C.SceneMode.SCENE3D)widget.scene.morphTo3D(0);setMapMode(false);widget.camera.flyTo({destination:C.Cartesian3.fromDegrees(16,28,window.innerWidth<768?24000000:14000000),duration:1.5});};
  const zoom=(direction:number)=>{widget.camera.cancelFlight();const amount=Math.max(25,widget.camera.positionCartographic.height*.35);if(direction>0)widget.camera.zoomIn(amount);else widget.camera.zoomOut(amount);widget.scene.requestRender();};
  const firstPlace=details?.places[0],more=details?.relatedContent[0];
  const moreExternal=external(details?.wikipedia??null)||external(details?.sources.find(source=>source.type==='church_source')?.url??null);
  const categories=['saint','feast','icon','event'] as const;
  const filtered=entries.filter(entry=>entry.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const catalogEntries=unified.catalog.entries.filter(entry=>mode==='churches'?['church','monastery','shrine'].includes(entry.entityType):['saint','feast','icon'].includes(entry.entityType)).filter(entry=>entry.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const matchingPlaces=sacredPlaces.filter(place=>place.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const activeSacredPlace=placeId?sacredPlaces.find(item=>item.id===placeId)??null:null;
  return <div className={styles.overlay} data-calendar-overlay data-mode={mode} data-selected={!!selected} data-sacred-place-open={!!activeSacredPlace}>
    <label className={styles.mapSearch}><Search size={17}/><input aria-label={shell.searchMap} placeholder={shell.searchMap} value={query} onChange={event=>setQuery(event.target.value)} onFocus={()=>{setDrawer(true);setLayerPanel(false);setMenu(false);closeCard();}}/></label>
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
      <button className={styles.today} onClick={()=>changeDate(today())}>{text.today}</button>
    </div>
    <div className={styles.topActions}>
      <button className={`${styles.iconButton} ${styles.layersButton}`} title={labels.layers} aria-label={labels.layers} aria-expanded={layerPanel} onClick={()=>{setLayerPanel(value=>!value);setDrawer(false);closeCard();setPlaceId(null);closePlot();}}><Layers size={19}/></button>
    </div>
    <button className={styles.dayToggle} aria-expanded={drawer} onClick={openDrawer}><CalendarDays size={16}/><span>{status==='ready'?`${entries.length} ${text.count}`:status==='error'?text.error:text.loading}</span><ChevronRight size={14}/></button>
    {layerPanel?<aside className={styles.layerPanel} aria-label={labels.layers}>
      <header><strong>{labels.layers}</strong><button className={styles.iconButton} aria-label={text.close} onClick={()=>setLayerPanel(false)}><X size={18}/></button></header>
      <EarthSourceControl earth={earth} sun={sun} onSunChange={()=>{setCalendarLighting(widget,!sun);setSun(!sun);}}/>
      {(Object.keys(visibility) as (keyof GlobeLayers)[]).filter(id=>id!=='sacredPlots').map(id=><label key={id}><input type="checkbox" data-layer={id} checked={visibility[id]} disabled={id==='routes'} onChange={event=>setVisibility(current=>({...current,[id]:event.target.checked}))}/>{labels[id]}</label>)}</aside>:null}
    {unified.error?<output className={styles.layerError} role="alert">{unified.error}</output>:null}
    {placeError?<output className={styles.layerError} role="alert">{placeError}</output>:null}
    {drawer&&mode!=='calendar'?<aside className={styles.drawer} data-testid="mode-panel">
      <header><h2>{text[mode==='map'?'map':mode==='globe'?'globe':mode]}</h2><button className={styles.iconButton} aria-label={text.close} onClick={()=>setDrawer(false)}><X size={18}/></button></header>
      <label className={styles.search}><Search size={17}/><input aria-label={text.search} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <section className={styles.placeResults}><h3>{labels.christianPlaces}</h3><ul>{matchingPlaces.map(place=><li key={place.id}><button data-place={place.id} onClick={()=>selectPlace.current(place.id,{push:true})}><span>{place.title}</span><small>{place.countryCode?countryMetadata[place.countryCode]?.name[locale]??place.countryCode:''}</small><MapPin size={14}/></button></li>)}</ul></section>
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
    {selected==='place:barbara-kyiv'&&!selectedPlot?<BarbaraPanel locale={locale} onClose={closeCard} onCalendar={()=>{setDate(`${date.slice(0,4)}-12-17`);setMode('calendar');setVisibility(current=>({...current,calendar:true}));}} onPlace={()=>{const place=christianPlaces.find(p=>p.id==='barbara-kyiv');if(place)placesLayer.current?.focus([sacredPlaceItem(place,locale)]);}}/>:null}
    {selected&&selected!=='place:barbara-kyiv'&&!selectedPlot?<aside className={`${styles.detail} ${publishedImage?styles.imageDetail:''}`} aria-label={details?.title??text.loading} data-testid="calendar-card">
      <header><span>{firstPlace?<><MapPin size={16}/>{firstPlace.placeTitle}</>:baseSelection?<><MapPin size={16}/>{details?.title}</>:<><CalendarDays size={16}/>{text.day}</>}</span><button className={styles.iconButton} aria-label={text.close} title={text.close} onClick={closeCard}><X size={20}/></button></header>
      {!details?<p role="status">{detailError?text.error:text.loading}</p>:<>
        {publishedImage?<figure data-version={publishedImage.versionId??'fallback'}><img key={publishedImage.panelKey??'fallback'} src={publishedImage.panelKey?'/'+publishedImage.panelKey:markerFallback(details.entityType)} alt={details.title} onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=markerFallback(details.entityType);}}/></figure>:details.image&&imageSource(details.image.url)?<figure><img src={imageSource(details.image.url)} alt={details.title}/>{details.image.license?<figcaption>{details.image.author} · <a href={external(details.image.commonsPage)} target="_blank" rel="noreferrer">{details.image.license}</a></figcaption>:null}</figure>:null}
        <div className={styles.cardBody}>
          <h2>{details.title}</h2>
          {!baseSelection?<p className={styles.meta}>{firstPlace?`${firstPlace.lat.toFixed(4)}°, ${firstPlace.lon.toFixed(4)}°`:format(date)}</p>:null}
          <span className={styles.type}>{sacred?`${labels[sacred.type]} · ${labels[sacred.denomination]}`:details.entityType==='country'?labels.countries:details.entityType==='capital'?labels.capitals:details.entityType==='city'?labels.cities:text[details.entityType as 'saint'|'feast'|'icon'|'event']??text.event}</span>
          {sacred?<p className={styles.meta}>{countryMetadata[sacred.country]?.name[locale]??sacred.country}</p>:null}
          {details.summary?<p className={styles.description}>{details.summary}</p>:null}
          {!baseSelection&&firstPlace?<p className={styles.description}>{locale==='ru'?'Сота — условное выделение связанного места, не историческая граница и не участок собственности. Автоматические географические связи требуют проверки.':locale==='uk'?'Комірка — умовне виділення пов’язаного місця, не історичний кордон і не ділянка власності. Автоматичні географічні зв’язки потребують перевірки.':'The hex marks an associated place, not a historical boundary or property parcel. Automated geographic links require review.'}</p>:null}
          {'locationNotice' in details&&details.locationNotice?<p className={styles.description} data-testid="history-mosaic-notice">{String(details.locationNotice)}</p>:null}
          {sacred?.relatedSaints?.length?<section><h3>{labels.related}</h3>{sacred.relatedSaints.map(saint=><p key={saint.en}>{saint[locale]}</p>)}</section>:null}
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
    {activeSacredPlace&&!selectedPlot?<SacredPlacePanel key={`${activeSacredPlace.id}:${locale}`} place={activeSacredPlace} tab={placeTab} locale={locale} onTabChange={setPlaceTab} onClose={()=>setPlaceId(null)} onNavigate={navigateToPlace}/>:null}
    {selectedPlot?<SacredPlotPanel plot={selectedPlot} locale={locale} onClose={closePlot} onNavigate={()=>{selectPlace.current(selectedPlot.associatedSacredPlaceId,{push:true});setPlaceTab('collection');}}
      placeTitle={sacredPlaces.find(item=>item.id===selectedPlot.sacredPlaceId)?.title??selectedPlot.sacredPlaceId}
      associatedTitle={sacredPlaces.find(item=>item.id===selectedPlot.associatedSacredPlaceId)?.title??selectedPlot.associatedSacredPlaceId}/>:null}
    <div className={styles.cameraControls}>
      {mode==='map'?<button className={styles.roundButton} aria-label={mapMode?'3D':'2D'} onClick={()=>{if(mapMode)widget.scene.morphTo3D(1);else widget.scene.morphTo2D(1);setMapMode(!mapMode);}}>{mapMode?'3D':'2D'}</button>:null}
      <button className={styles.roundButton} title={text.north} aria-label={text.north} onClick={()=>widget.camera.flyTo({destination:widget.camera.positionWC.clone(),orientation:{heading:0,pitch:widget.camera.pitch,roll:0},duration:.8})}><Compass size={22}/></button>
      <button className={styles.roundButton} title={text.zoomIn} aria-label={text.zoomIn} onClick={()=>zoom(1)}><Plus size={24}/></button>
      <button className={styles.roundButton} title={text.zoomOut} aria-label={text.zoomOut} onClick={()=>zoom(-1)}><Minus size={24}/></button>
    </div>
    <button className={styles.overview} onClick={overview}><Globe2 size={18}/>{text.showAll}</button>
    {mode==='history'?<nav className={styles.timeline} aria-label={text.history}><label>{labels.year} <select value={unified.year} onChange={event=>unified.setYear(event.target.value)}><option value="">{labels.all}</option>{unified.years.map(year=><option key={year}>{year}</option>)}</select></label><span>{unified.events.length?`${unified.events.length} ${labels.events}`:labels.empty}</span></nav>:<nav className={styles.timeline} aria-label={text.calendar}>{[-2,-1,0,1,2].map(offset=>{const value=offsetDate(date,offset);return <button key={offset} aria-current={offset===0?'date':undefined} aria-label={format(value)} onClick={()=>changeDate(value)}><i/><span>{format(value,offset===0?{day:'numeric',month:'long'}:{day:'numeric',month:'short'})}</span></button>;})}</nav>}
  </div>;
}
