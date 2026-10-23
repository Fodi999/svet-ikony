'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Navigation2,Box,CalendarDays,ChevronLeft,ChevronRight,Compass,Globe2,Layers,Map as MapIcon,MapPin,Minus,Plus,Search,X} from 'lucide-react';
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
import {SaintExtras} from './SaintExtras';
import {useMarkerImages} from './useMarkerImages';
import {markerPublication} from '@/lib/cesium/marker-publication';
import {markerFallback} from '@/lib/cesium/photo-marker';
import type {EarthStreaming} from '@/lib/cesium/earth-streaming';
import {createSacredPlacesLayer,type TerritoryFeature} from '@/lib/cesium/sacred-places';
import type {SacredPlaceMarker,PlaceProfile} from '@/lib/d1/repositories/calendarGeoPlaces';
import {SacredPlacePanel} from './SacredPlacePanel';
import {SacredPlotPanel} from './SacredPlotPanel';
import {CalendarTimeline,nextEventDay} from './CalendarTimeline';
import {RoutePlanner} from './RoutePlanner';
import {createRouteLayer} from '@/lib/cesium/route-layer';
import {createOrbit} from '@/lib/cesium/orbit';
import {journeys,journeySchedule} from '@/lib/cesium/journeys';
import {createJourneyLayer,type JourneyTick} from '@/lib/cesium/journey-layer';
import {JourneyPlayer} from './JourneyPlayer';
import {Select} from '@/components/ui/select';
import {CalendarIcon,ChurchIcon,GlobeIcon,JourneyIcon,SaintIcon,ScrollIcon} from '@/components/site/icons/OrthodoxIcons';
import {flyToResult,geocodePlaces,type GeocodeResult} from '@/lib/cesium/geocode';
import type {Basemap} from '@/lib/cesium/earth-streaming';
import type {Route} from '@/lib/routes/osrm';
import type {CalendarGeoYearDay} from '@/lib/d1/repositories/calendarGeo';
import type {SacredPlot} from '@/lib/cesium/sacred-plots';
// Sacred Plots pilot scope (ТЗ п.1): only Kyiv-Pechersk Lavra gets a hex
// grid for now -- see lib/cesium/sacred-plots-layer.ts's setTerritory().
const PLOTS_PILOT_PLACE='place-kyiv-pechersk-lavra';
/** Time on each day while the timeline plays, including the camera flight. */
const PLAY_DWELL=4800;

type Details={id:string;title:string;summary:string;biography?:string;entityType:string;matchStatus:string;wikipedia:string|null;places:CalendarGeoItem[];
  image:{url:string;author:string;license:string;commonsPage:string}|null;
  sources:{url:string;type:string}[];relatedContent:{type:string;slug:string;title:string;language:string;groupId?:string}[];commemorations?:{date:string}[]};
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const offsetDate=(date:string,offset:number)=>{const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const external=(url:string|null)=>url?.startsWith('https://')?url:undefined;
const imageSource=(url:string)=>external(url)||(url.startsWith('/')&&!url.startsWith('//')?url:undefined);
const contentHref=(link:Details['relatedContent'][number])=>`/${link.language}/${link.type==='life'?'saints':link.type==='prayer'?'prayers':link.type==='icon'?'icons':'church/articles'}/${encodeURIComponent(link.slug)}`;

// Turn the globe to the day's events: one point is approached closely, several are framed together.
/** How much of the globe the open panels cover (fractions of the canvas): side panels on desktop, sheets and the timeline at the bottom. */
function panelInsets(widget:C.CesiumWidget){
  const canvas=widget.canvas.getBoundingClientRect(),insets={left:0,right:0,top:0,bottom:0};
  if(!canvas.width||!canvas.height)return insets;
  for(const panel of widget.container.parentElement?.querySelectorAll('[data-sacred-place-panel],[data-testid="calendar-card"],[data-calendar-timeline]')??[]){
    const rect=panel.getBoundingClientRect();
    if(!rect.width||!rect.height)continue;
    if(rect.width>canvas.width*.6)insets.bottom=Math.max(insets.bottom,(canvas.bottom-rect.top)/canvas.height);
    else if(rect.left+rect.width/2>canvas.left+canvas.width/2)insets.right=Math.max(insets.right,(canvas.right-rect.left)/canvas.width);
    else insets.left=Math.max(insets.left,(rect.right-canvas.left)/canvas.width);
  }
  return insets;
}
function flyToDay(widget:C.CesiumWidget,dayItems:CalendarGeoItem[]){
  const positions=dayItems.filter(item=>Number.isFinite(item.lat)&&Number.isFinite(item.lon)).map(item=>C.Cartesian3.fromDegrees(item.lon,item.lat));
  if(!positions.length||widget.isDestroyed())return false;
  const sphere=C.BoundingSphere.fromPoints(positions),center=C.Cartographic.fromCartesian(sphere.center);
  if(!center)return false;
  const height=Math.min(9_000_000,Math.max(window.innerWidth<768?2_600_000:1_800_000,sphere.radius*3.5));
  widget.camera.cancelFlight();
  widget.camera.flyTo({destination:C.Cartesian3.fromRadians(center.longitude,center.latitude,height),
    duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:2.4,easingFunction:C.EasingFunction.QUADRATIC_IN_OUT});
  return true;
}
export function CalendarGlobeOverlay({widget,earth=null}:{widget:C.CesiumWidget;earth?:EarthStreaming|null}) {
  const markerImages=useMarkerImages();
  const {locale}=useI18n(),text=calendarCopy[locale],shell=siteShellCopy[locale];
  const [demo]=useState(()=>sacredDemo(new URLSearchParams(window.location.search),window.location.hostname));
  const [mode,setMode]=useState<GlobeMode>(()=>modeFromParams(new URLSearchParams(window.location.search)));
  const [visibility,setVisibility]=useState(()=>readLayers(new URLSearchParams(window.location.search))),[layerPanel,setLayerPanel]=useState(false);
  const [date,setDate]=useState(()=>{const params=new URLSearchParams(window.location.search),value=params.get('date')??params.get('calendarDate');return value&&validDate(value)?value:today();});
  const [items,setItems]=useState<CalendarGeoItem[]>(()=>demo?.items??[]),[entries,setEntries]=useState<CalendarEntry[]>([]);
  const [selected,setSelected]=useState<string|null>(()=>new URLSearchParams(window.location.search).get('entity')),[loadedDetails,setDetails]=useState<Details|null>(null);
  const [drawer,setDrawer]=useState(()=>!['globe','map','journeys'].includes(mode)),[menu,setMenu]=useState(false),[query,setQuery]=useState('');
  const [placeId,setPlaceId]=useState<string|null>(()=>placeFromParams(new URLSearchParams(window.location.search)));
  const unified=useUnifiedLayers(widget,locale,visibility,selected,id=>{setSelected(id);setDetails(null);setDrawer(false);setPlaceId(null);}),labels={...layerCopy[locale],...christianCopy[locale]};
  const sacred=christianPlaces.find(place=>`place:${place.id}`===selected);
  const baseSelection=!!selected&&/^(country|capital|city|event):/.test(selected);
  const fixture=demo?.items.find(item=>item.entityId===selected);
  const details:Details|null=sacred?{id:`place:${sacred.id}`,title:sacred.name[locale],summary:sacred.description[locale],entityType:sacred.type,matchStatus:sacred.verifiedAnchor?'reviewed_verified':'editorial_demo',wikipedia:sacred.source,places:[sacredPlaceItem(sacred,locale)],image:sacred.imageUrl?{url:sacred.imageUrl,author:'',license:'',commonsPage:''}:null,sources:[{type:'editorial_source',url:sacred.source},...(sacred.coordinateSource?[{type:'coordinates',url:sacred.coordinateSource}]:[])],relatedContent:sacred.prayerSlug?[{type:'prayer',slug:sacred.prayerSlug,title:locale==='ru'?'Молитва и аудио':locale==='uk'?'Молитва й аудіо':'Prayer and audio',language:locale}]:[]}:fixture?{id:fixture.entityId,title:fixture.title,summary:'Local visual test fixture. Not a calendar record.',entityType:fixture.entityType,matchStatus:'local_fixture',wikipedia:null,places:[fixture],image:null,sources:[],relatedContent:[]}:baseSelection?unified.selectionDetails():loadedDetails;
  const [status,setStatus]=useState(demo?'ready':'loading'),[detailError,setDetailError]=useState(false),[retry,setRetry]=useState(0);
  const [mapMode,setMapMode]=useState(false),[sun,setSun]=useState(false),[relief,setRelief]=useState(false),[reliefBusy,setReliefBusy]=useState(false);
  useEffect(()=>earth?.subscribe(state=>setRelief(state.terrain&&state.buildings)),[earth]);
  const [playing,setPlaying]=useState(false),[yearDays,setYearDays]=useState<CalendarGeoYearDay[]>([]);
  // "How to get there": one route at a time, shown over the plain road map; the previous basemap returns when it is cleared.
  const routeLayer=useRef<ReturnType<typeof createRouteLayer>|null>(null),basemapBeforeRoute=useRef<Basemap|null>(null);
  useEffect(()=>{const layer=createRouteLayer(widget);routeLayer.current=layer;return()=>{layer.dispose();routeLayer.current=null;};},[widget]);
  const orbit=useRef<ReturnType<typeof createOrbit>|null>(null);
  useEffect(()=>{const instance=createOrbit(widget);orbit.current=instance;return()=>{instance.dispose();orbit.current=null;};},[widget]);
  // Journeys ("Подорожі"): the route of one journey and its animated traveller; only in the journeys mode.
  const [journeyId,setJourneyId]=useState(journeys[0].id),[journeyTick,setJourneyTick]=useState<JourneyTick>({time:0,total:0,stop:0,moving:false,playing:false});
  const journeyLayer=useRef<ReturnType<typeof createJourneyLayer>|null>(null),localeRef=useRef(locale);
  useEffect(()=>{localeRef.current=locale;journeyLayer.current?.redraw();},[locale]);
  useEffect(()=>{
    let lastTick=0;
    const layer=createJourneyLayer(widget,{icon:'/journeys/apostle-paul.jpg',locale:()=>localeRef.current,onTick:tick=>{
      // The caption and scrubber need ~10 updates a second, not one per animation frame.
      const now=performance.now();if(tick.playing&&now-lastTick<100)return;lastTick=now;setJourneyTick(tick);
    }});
    journeyLayer.current=layer;return()=>{layer.dispose();journeyLayer.current=null;};
  },[widget]);
  const journey=journeys.find(item=>item.id===journeyId)??journeys[0];
  const [journeySchedules]=useState(()=>new Map(journeys.map(item=>[item.id,journeySchedule(item)])));
  useEffect(()=>{
    if(mode!=='journeys'){journeyLayer.current?.select(null);return;}
    orbit.current?.stop();
    // Let the mode's panels settle before measuring what they cover.
    const timer=setTimeout(()=>journeyLayer.current?.select(journey,panelInsets(widget)),60);
    return()=>clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-frame only when the journey or mode changes
  },[mode,journeyId,widget]);
  // World place search: only where the globe streams Cesium ion (its geocoder shares that token).
  const [worldResults,setWorldResults]=useState<GeocodeResult[]>([]);
  const showRoute=(route:(Route&{from:{lat:number;lon:number}})|null)=>{
    if(route){
      setPlaying(false);orbit.current?.stop();
      routeLayer.current?.show({coordinates:route.coordinates,from:route.from},panelInsets(widget));
      if(earth&&earth.state.basemap!=='road'&&basemapBeforeRoute.current===null){basemapBeforeRoute.current=earth.state.basemap;void earth.setBasemap('road');}
      return;
    }
    routeLayer.current?.clear();
    if(earth&&basemapBeforeRoute.current){void earth.setBasemap(basemapBeforeRoute.current);}
    basemapBeforeRoute.current=null;
  };
  const showRouteRef=useRef(showRoute);
  useEffect(()=>{showRouteRef.current=showRoute;});
  const playingRef=useRef(playing),modeRef=useRef(mode);
  useEffect(()=>{playingRef.current=playing;modeRef.current=mode;},[playing,mode]);
  // The date whose events the camera should turn to once they load: today's on first open, then every timeline step.
  const flyRequest=useRef<string|null>((()=>{const params=new URLSearchParams(window.location.search);return params.has('entity')||params.has('place')?null:date;})());
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
    placesLayer.current?.update(christianPlaces.map(place=>{const item=sacredPlaceItem(place,locale),image=markerPublication(markerImages,item.entityId,item.placeId);return image?{...item,thumbnail:image.markerKey?'/'+image.markerKey:null,imageVerified:!!image.markerKey}:item;}),'all',selected,visibility.sacredModels);
    placesLayer.current?.setVisible(visibility.christianPlaces);
  },[locale,selected,visibility.sacredModels,visibility.christianPlaces,markerImages]);
  useEffect(()=>{
    const instance=createSacredPlacesLayer(widget,id=>selectPlace.current(id),plot=>{
      // Sacred Plot hex click (ТЗ п.4/п.7): clears any place/entity selection
      // and opens SacredPlotPanel instead -- mirrors selectPlace.current's
      // own "clear entity selection" step above, in the other direction.
      setPlaceId(null);setSelected(null);setDetails(null);setDrawer(false);setMenu(false);
      setSelectedPlot(plot);
    },error=>console.error('[sacred-places]',error),{legacyPlots:true});
    sacredLayer.current=instance;
    return()=>{instance.dispose();sacredLayer.current=null;};
  },[widget]);
  useEffect(()=>{
    let controller=new AbortController();
    const refresh=()=>{
    controller.abort();
    controller=new AbortController();
    const current=controller;
    void fetch('/api/calendar/places?bbox=-180,-90,180,90&locale='+locale,{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('places');return response.json() as Promise<SacredPlaceMarker[]>;})
      .then(async data=>{
        if(current.signal.aborted)return;
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
        if(!current.signal.aborted){
          void sacredLayer.current?.setTerritories(features);
          // Sacred Plots (honeycomb cells) -- pilot territory: Kyiv-Pechersk
          // Lavra; cells are shown only when the camera is close (see the
          // LOD in sacred-plots-layer.ts) and are clickable/hoverable.
          const pilot=features.find(feature=>feature.placeId===PLOTS_PILOT_PLACE);
          if(pilot)sacredLayer.current?.setPlotTerritory(pilot,{candidatePlaces:data.filter(item=>item.id!==PLOTS_PILOT_PLACE).map(item=>({id:item.id,lat:item.lat,lon:item.lon}))});
        }
      })
      .catch(()=>{});
    };
    refresh();
    window.addEventListener('focus',refresh);
    return()=>{controller.abort();window.removeEventListener('focus',refresh);};
  },[locale]);
  useEffect(()=>{sacredLayer.current?.setPlotsVisible(visibility.sacredPlots);},[widget,visibility.sacredPlots]);
  useEffect(()=>{sacredLayer.current?.update(sacredPlaces,placeId,markerImages);},[sacredPlaces,placeId,markerImages]);
  // A place with its own 3D model replaces the generic OSM building box at that spot.
  useEffect(()=>{earth?.hideBuildingsAt(sacredPlaces.filter(place=>place.model).map(place=>({lat:place.lat,lon:place.lon,radius:15})));},[earth,sacredPlaces]);
  useEffect(()=>{sacredLayer.current?.setVisible(visibility.christianPlaces||visibility.churches||visibility.monasteries);},[visibility.christianPlaces,visibility.churches,visibility.monasteries]);
  useEffect(()=>{
    if(!placeId){focusedSacredPlace.current=null;orbit.current?.stop();return;}
    if(focusedSacredPlace.current===placeId)return;
    const target=sacredPlaces.find(item=>item.id===placeId);
    if(!target)return;
    focusedSacredPlace.current=placeId;
    // Fly in at an angle and circle the shrine until the visitor takes over.
    orbit.current?.start(target);
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
        if(!controller.signal.aborted){
          setItems(payload.items);setEntries(payload.entries);setStatus('ready');
          if(flyRequest.current===date){
            flyRequest.current=null;
            // On a wide screen the main commemoration's card opens beside the map; on a phone it would cover it.
            if(flyToDay(widget,payload.items)&&window.innerWidth>=768&&(playingRef.current||modeRef.current==='calendar')){setDetails(null);setDetailError(false);setSelected(payload.items[0].entityId);}
          }
        }
      }catch{if(!controller.signal.aborted)setStatus('error');}
    };void load();return()=>controller.abort();
  },[date,locale,retry,demo,widget]);
  const selectedId=baseSelection?null:selected?.startsWith('entry:')?entries.find(entry=>entry.id===selected.slice(6))?.entityId:selected;
  const publishedImage=markerPublication(markerImages,selectedId,sacred?.id);
  useEffect(()=>{
    refreshEntities.current=()=>{
      const flags=entityVisibility.current;
      const global=unified.catalog.items.filter(item=>(flags.saints&&['saint','feast','icon'].includes(item.entityType))||(flags.churches&&['church','shrine'].includes(item.entityType))||(flags.monasteries&&item.entityType==='monastery'));
      const visible=(demo?demo.items:[...(flags.calendar?items:[]),...global]).map(item=>{
        const image=markerPublication(markerImages,item.entityId,item.placeId);
        return image?{...item,thumbnail:image.markerKey?'/'+image.markerKey:null,imageVerified:!!image.markerKey}:item;
      });itemsRef.current=visible;
      layer.current?.update(visible,'all',selectedId??null,visibility.sacredModels);
    };refreshEntities.current();
  },[items,selectedId,unified.catalog.items,demo,visibility.sacredModels,markerImages]);
  useEffect(()=>{
    if(!selected||baseSelection||christianPlaces.some(place=>`place:${place.id}`===selected))return;const controller=new AbortController(),isEntry=selected.startsWith('entry:');
    if(demo?.items.some(item=>item.entityId===selected))return;
    void fetch(`/api/calendar/${isEntry?'entry':'entity'}/${encodeURIComponent(isEntry?selected.slice(6):selected)}?locale=${locale}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('card');const data=await response.json() as Details;
      if(!Array.isArray(data.places)||!Array.isArray(data.sources)||!Array.isArray(data.relatedContent))throw new Error('card payload');
      if(!controller.signal.aborted)setDetails(data);
    }).catch(()=>{if(!controller.signal.aborted)setDetailError(true);});return()=>controller.abort();
  },[selected,locale,baseSelection,demo]);
  // A route belongs to the open place or card; it goes when they change.
  useEffect(()=>()=>showRouteRef.current(null),[placeId,selected]);
  const year=date.slice(0,4);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/calendar/geo/year?'+new URLSearchParams({year,locale,calendarSystem:'julian',tradition:'orthodox'}),{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('year');return response.json() as Promise<{days:CalendarGeoYearDay[]}>;})
      .then(payload=>{if(!controller.signal.aborted)setYearDays(Array.isArray(payload.days)?payload.days:[]);})
      .catch(()=>{if(!controller.signal.aborted)setYearDays([]);});
    return()=>controller.abort();
  },[year,locale]);
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
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPlaying(false);setSelected(null);setDetails(null);setDrawer(false);setLayerPanel(false);setMenu(false);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[]);
  const format=(value:string,options:Intl.DateTimeFormatOptions={dateStyle:'long'})=>new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const switchMode=(next:GlobeMode)=>{setPlaying(false);setMode(next);setVisibility(current=>layersForMode(current,next));setDrawer(next!=='globe'&&next!=='map'&&next!=='journeys');setMenu(false);setLayerPanel(false);setSelected(null);setDetails(null);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);};
  const changeDate=(value:string)=>{if(validDate(value)){flyRequest.current=value;setDate(value);setMode('calendar');setDrawer(true);setMenu(false);setLayerPanel(false);setSelected(null);setDetails(null);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);}};
  useEffect(()=>{
    if(!earth||query.trim().length<3)return;
    let cancelled=false;
    const timer=setTimeout(()=>{void geocodePlaces(widget,query).then(results=>{if(!cancelled)setWorldResults(results);}).catch(()=>{if(!cancelled)setWorldResults([]);});},450);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[query,earth,widget]);
  const shownWorldResults=earth&&query.trim().length>=3?worldResults:[];
  const openWorldResult=(result:GeocodeResult)=>{setPlaying(false);orbit.current?.stop();setDrawer(false);flyToResult(widget,result);};
  const worldSection=shownWorldResults.length?<section className={styles.placeResults} data-testid="world-results"><h3>{shell.worldPlaces}</h3><ul>{shownWorldResults.map(result=><li key={result.name}><button onClick={()=>openWorldResult(result)}><span>{result.name}</span><Navigation2 size={14}/></button></li>)}</ul></section>:null;
  /** Timeline navigation: shows the day's events on the globe without opening the day list. */
  const goToDate=(value:string)=>{
    if(!validDate(value))return;
    orbit.current?.stop();
    flyRequest.current=value;setDate(value);
    if(mode!=='calendar'){setMode('calendar');setVisibility(current=>layersForMode(current,'calendar'));}
    setDrawer(false);setMenu(false);setLayerPanel(false);setSelected(null);setDetails(null);setPlaceId(null);setSelectedPlot(null);sacredLayer.current?.selectPlot(null);
  };
  const togglePlay=()=>{
    if(playing){setPlaying(false);return;}
    // Start on the current day when it has events, otherwise on the next day that does (wrapping to the first).
    const start=yearDays.some(day=>day.date===date)?date:nextEventDay(yearDays,date)??yearDays[0]?.date;
    if(!start)return;
    setPlaying(true);
    if(start!==date)goToDate(start);
    else if(status==='ready'&&flyToDay(widget,items)&&window.innerWidth>=768&&items[0]){setDetails(null);setSelected(items[0].entityId);}
  };
  useEffect(()=>{
    if(!playing||status!=='ready')return;
    const timer=setTimeout(()=>{const next=nextEventDay(yearDays,date);if(next)goToDate(next);else setPlaying(false);},items.length?PLAY_DWELL:300);
    return()=>clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- goToDate is a plain function recreated each render
  },[playing,status,date,items,yearDays]);
  const openEntry=(entry:CalendarEntry)=>{
    const key='entry:'+entry.id;if(selected!==key){setDetails(null);setDetailError(false);setSelected(key);}setDrawer(false);
    if(entry.hasGeo)layer.current?.focus(items.filter(item=>item.entityId===entry.entityId));else widget.camera.cancelFlight();
  };
  const closeCard=()=>{setSelected(null);setDetails(null);};
  const closePlot=()=>{setSelectedPlot(null);sacredLayer.current?.selectPlot(null);};
  // Place-to-place hierarchy navigation (SacredPlacePanel's parent/child
  // links, calendar_geo_place_relations). Pushes a new history entry (unlike
  // every other place/tab change, which the sync effect folds into the
  // current entry via replaceState) so Back can step from child to parent.
  const navigateToPlace=(nextPlaceId:string)=>selectPlace.current(nextPlaceId,{push:true});
  const openDrawer=()=>{if(mode!=='calendar')switchMode('calendar');else setDrawer(value=>!value);setSelected(null);setDetails(null);setMenu(false);};
  const overview=()=>{widget.camera.cancelFlight();if(widget.scene.mode!==C.SceneMode.SCENE3D)widget.scene.morphTo3D(0);setMapMode(false);widget.camera.flyTo({destination:C.Cartesian3.fromDegrees(16,28,window.innerWidth<768?18000000:14000000),duration:1.5});};
  const toggleFlat=()=>{widget.camera.cancelFlight();if(mapMode)widget.scene.morphTo3D(1);else widget.scene.morphTo2D(1);setMapMode(!mapMode);};
  const toggleRelief=async()=>{
    if(!earth||reliefBusy)return;
    const next=!relief;setReliefBusy(true);
    try{
      if(next&&mapMode){widget.scene.morphTo3D(0);setMapMode(false);}
      await earth.setRelief3D(next);
      if(next){
        // Tilt towards the horizon so the relief and buildings are actually visible.
        const center=widget.camera.getPickRay(new C.Cartesian2(widget.canvas.clientWidth/2,widget.canvas.clientHeight/2));
        const target=center?widget.scene.globe.pick(center,widget.scene):undefined;
        const height=widget.camera.positionCartographic.height;
        if(target)widget.camera.flyToBoundingSphere(new C.BoundingSphere(target,0),{duration:1.4,offset:new C.HeadingPitchRange(widget.camera.heading,C.Math.toRadians(-32),height>80000?4500:Math.max(900,height*1.1))});
      }
    }finally{setReliefBusy(false);}
  };
  const zoom=(direction:number)=>{widget.camera.cancelFlight();const amount=Math.max(25,widget.camera.positionCartographic.height*.35);if(direction>0)widget.camera.zoomIn(amount);else widget.camera.zoomOut(amount);widget.scene.requestRender();};
  const firstPlace=details?.places[0],more=details?.relatedContent[0];
  const moreExternal=external(details?.wikipedia??null)||external(details?.sources.find(source=>source.type==='church_source')?.url??null);
  const categories=['saint','feast','icon','event'] as const;
  const filtered=entries.filter(entry=>entry.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const catalogEntries=unified.catalog.entries.filter(entry=>mode==='churches'?['church','monastery','shrine'].includes(entry.entityType):['saint','feast','icon'].includes(entry.entityType)).filter(entry=>entry.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const matchingPlaces=sacredPlaces.filter(place=>place.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const activeSacredPlace=placeId?sacredPlaces.find(item=>item.id===placeId)??null:null;
  return <div className={styles.overlay} data-calendar-overlay data-mode={mode} data-selected={!!selected} data-sacred-place-open={!!activeSacredPlace}>
    <label className={styles.mapSearch}><Search size={17}/><input aria-label={shell.searchMap} placeholder={shell.searchMap} value={query} onChange={event=>setQuery(event.target.value)}
      onKeyDown={event=>{if(event.key!=='Enter')return;const place=matchingPlaces[0];if(place&&query.trim())selectPlace.current(place.id,{push:true});else if(shownWorldResults[0])openWorldResult(shownWorldResults[0]);}} onFocus={()=>{setDrawer(true);setLayerPanel(false);setMenu(false);closeCard();}}/></label>
    <nav className={`${styles.navigation} ${menu?styles.menuOpen:''}`} aria-label={text.menu}>
      <button data-mode-button="globe" aria-label={text.globe} title={text.globe} aria-current={mode==='globe'?'page':undefined} onClick={()=>switchMode('globe')}><GlobeIcon/><span>{text.globe}</span></button>
      <button data-mode-button="calendar" aria-label={text.calendar} title={text.calendar} aria-current={mode==='calendar'?'page':undefined} aria-expanded={mode==='calendar'?drawer:undefined} onClick={openDrawer}><CalendarIcon/><span>{text.calendar}</span></button>
      <button data-mode-button="saints" aria-label={text.saints} title={text.saints} aria-current={mode==='saints'?'page':undefined} onClick={()=>switchMode('saints')}><SaintIcon/><span>{text.saints}</span></button>
      <button data-mode-button="churches" aria-label={text.churches} title={text.churches} aria-current={mode==='churches'?'page':undefined} onClick={()=>switchMode('churches')}><ChurchIcon/><span>{text.churches}</span></button>
      <button data-mode-button="history" aria-label={text.history} title={text.history} aria-current={mode==='history'?'page':undefined} onClick={()=>switchMode('history')}><ScrollIcon/><span>{text.history}</span></button>
      <button data-mode-button="journeys" aria-label={text.journeys} title={text.journeys} aria-current={mode==='journeys'?'page':undefined} onClick={()=>switchMode('journeys')}><JourneyIcon/><span>{text.journeys}</span></button>
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
    {layerPanel?<aside className={styles.layerPanel} aria-label={labels.layers}>
      <header><strong>{labels.layers}</strong><button className={styles.iconButton} aria-label={text.close} onClick={()=>setLayerPanel(false)}><X size={18}/></button></header>
      <EarthSourceControl earth={earth} sun={sun} onSunChange={()=>{setCalendarLighting(widget,!sun);setSun(!sun);}}/>
      {(Object.keys(visibility) as (keyof GlobeLayers)[]).filter(id=>id!=='routes'&&id!=='sacredModels').map(id=><label key={id}><input type="checkbox" data-layer={id} checked={visibility[id]} onChange={event=>setVisibility(current=>({...current,[id]:event.target.checked}))}/>{labels[id]}</label>)}</aside>:null}
    {unified.error?<output className={styles.layerError} role="alert">{unified.error}</output>:null}
    {placeError?<output className={styles.layerError} role="alert">{placeError}</output>:null}
    {drawer&&mode!=='calendar'?<aside className={styles.drawer} data-testid="mode-panel">
      <header><h2>{text[mode==='map'?'map':mode==='globe'?'globe':mode]}</h2><button className={styles.iconButton} aria-label={text.close} onClick={()=>setDrawer(false)}><X size={18}/></button></header>
      {worldSection}
      <section className={styles.placeResults}><h3>{labels.christianPlaces}</h3><ul>{matchingPlaces.map(place=><li key={place.id}><button data-place={place.id} onClick={()=>selectPlace.current(place.id,{push:true})}><span>{place.title}</span><small>{place.countryCode?countryMetadata[place.countryCode]?.name[locale]??place.countryCode:''}</small><MapPin size={14}/></button></li>)}</ul></section>
      <div className={styles.scrollArea}><ul>{mode==='history'?unified.events.filter(event=>event.title.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))).map(event=><li key={event.id}><button onClick={()=>{setSelected('event:'+event.id);setDrawer(false);}}>{event.title}<small>{event.displayDate}</small></button></li>):catalogEntries.map(entry=><li key={entry.id}><button onClick={()=>{setDetails(null);setSelected(entry.id);setDrawer(false);}}>{entry.title}{entry.hasGeo?<MapPin size={14}/>:null}</button></li>)}</ul>{(mode==='history'?!unified.events.length:!catalogEntries.length)?<p>{labels.empty}</p>:null}</div>
    </aside>:null}
    {drawer&&mode==='calendar'?<aside className={styles.drawer} aria-label={text.day} data-testid="calendar-day">
      <header><div><small>{text.day}</small><h2>{format(date)}</h2><span>{entries.length} {text.count}</span></div><button className={styles.iconButton} aria-label={text.close} onClick={()=>setDrawer(false)}><X size={18}/></button></header>
      {worldSection}
      <div className={styles.scrollArea}>
        {status==='loading'?<p role="status">{text.loading}</p>:status==='error'?<p role="alert">{text.error} <button onClick={()=>setRetry(value=>value+1)}>{text.retry}</button></p>:!filtered.length?<p>{text.empty}</p>:null}
        {categories.map(category=>{const group=filtered.filter(entry=>entry.entityType===category);return group.length?<section key={category}><h3>{text[category]} <small>{group.length}</small></h3><ul>{group.map(entry=><li key={entry.id}><button onClick={()=>openEntry(entry)}><span>{entry.title}</span>{entry.hasGeo?<MapPin size={14} aria-label={text.places}/>:null}<ChevronRight size={14}/></button></li>)}</ul></section>:null;})}
      </div>
    </aside>:null}
    {selected&&!selectedPlot?<aside className={`${styles.detail} ${publishedImage?styles.imageDetail:''}`} aria-label={details?.title??text.loading} data-testid="calendar-card">
      <header><span>{firstPlace?<><MapPin size={16}/>{firstPlace.placeTitle}</>:baseSelection?<><MapPin size={16}/>{details?.title}</>:<><CalendarDays size={16}/>{text.day}</>}</span><button className={styles.iconButton} aria-label={text.close} title={text.close} onClick={closeCard}><X size={20}/></button></header>
      {!details?<p role="status">{detailError?text.error:text.loading}</p>:<>
        {publishedImage?<figure data-version={publishedImage.versionId??'fallback'}><img key={publishedImage.panelKey??'fallback'} src={publishedImage.panelKey?'/'+publishedImage.panelKey:markerFallback(details.entityType)} alt={details.title} onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=markerFallback(details.entityType);}}/></figure>:details.image&&imageSource(details.image.url)?<figure><img src={imageSource(details.image.url)} alt={details.title}/>{details.image.license?<figcaption>{details.image.author} · <a href={external(details.image.commonsPage)} target="_blank" rel="noreferrer">{details.image.license}</a></figcaption>:null}</figure>:null}
        <div className={styles.cardBody}>
          <h2>{details.title}</h2>
          {!baseSelection?<p className={styles.meta}>{firstPlace?`${firstPlace.lat.toFixed(4)}°, ${firstPlace.lon.toFixed(4)}°`:format(date)}</p>:null}
          <span className={styles.type}>{sacred?`${labels[sacred.type]} · ${labels[sacred.denomination]}`:details.entityType==='country'?labels.countries:details.entityType==='capital'?labels.capitals:details.entityType==='city'?labels.cities:text[details.entityType as 'saint'|'feast'|'icon'|'event']??text.event}</span>
          {sacred?<p className={styles.meta}>{countryMetadata[sacred.country]?.name[locale]??sacred.country}</p>:null}
          {details.summary?<p className={styles.description}>{details.summary}</p>:null}
          {!baseSelection&&firstPlace?<small className={styles.footnote}>{locale==='ru'?'Сота — условное выделение связанного места, не историческая граница и не участок собственности. Автоматические географические связи требуют проверки.':locale==='uk'?'Комірка — умовне виділення пов’язаного місця, не історичний кордон і не ділянка власності. Автоматичні географічні зв’язки потребують перевірки.':'The hex marks an associated place, not a historical boundary or property parcel. Automated geographic links require review.'}</small>:null}
          {'locationNotice' in details&&details.locationNotice?<p className={styles.description} data-testid="history-mosaic-notice">{String(details.locationNotice)}</p>:null}
          {sacred?.relatedSaints?.length?<section><h3>{labels.related}</h3>{sacred.relatedSaints.map(saint=><p key={saint.en}>{saint[locale]}</p>)}</section>:null}
          {!firstPlace&&!baseSelection?<small className={styles.noPlace}>{text.noPlace}</small>:null}
          {details.biography?<details className={styles.life}><summary>{text.life}</summary><p>{details.biography}</p></details>:null}
          {details.entityType==='saint'&&!sacred&&!fixture?<SaintExtras key={details.id+locale} locale={locale} related={details.relatedContent} commemorations={details.commemorations??[]} onCalendar={day=>{setDate(day);setMode('calendar');setVisibility(current=>({...current,calendar:true}));}}/>:null}
          {firstPlace&&!baseSelection?<RoutePlanner key={firstPlace.placeId} destination={firstPlace} locale={locale} onRoute={showRoute}/>:null}
          {firstPlace?<ul className={styles.places}>{details.places.map(place=><li key={place.placeId+place.relationType}><MapPin size={14}/><span>{place.placeTitle}<small>{text[place.relationType as 'birth'|'death'|'burial'|'residence']??place.relationType}</small></span></li>)}</ul>:null}
          {details.matchStatus==='machine_high'&&firstPlace?<small className={styles.noPlace}>{text.machine}</small>:null}
          <nav className={styles.related}>{details.relatedContent.map(link=><a key={link.type+link.slug} href={contentHref(link)}>{link.type==='life'?text.life:link.type==='prayer'?text.prayer:link.title}<ArrowRight size={15}/></a>)}</nav>
          {more||moreExternal?<a className={styles.primary} href={more?contentHref(more):moreExternal} target={more?undefined:'_blank'} rel={more?undefined:'noreferrer'}>{text.more}<ArrowRight size={18}/></a>:null}
          {details.sources.length?<details className={styles.sources}><summary>{text.sources}</summary>{details.sources.filter(source=>external(source.url)).map(source=><a key={source.url} href={external(source.url)} target="_blank" rel="noreferrer">{new URL(source.url).hostname.replace('www.','')}<ArrowRight size={12}/></a>)}</details>:null}
        </div>
      </>}
    </aside>:null}
    {activeSacredPlace&&!selectedPlot?<SacredPlacePanel onRoute={showRoute} imageUrl={markerPublication(markerImages,null,activeSacredPlace.id)?.panelKey?'/'+markerPublication(markerImages,null,activeSacredPlace.id)!.panelKey:undefined} key={`${activeSacredPlace.id}:${locale}`} place={activeSacredPlace} tab={placeTab} locale={locale} onTabChange={setPlaceTab} onClose={()=>setPlaceId(null)} onNavigate={navigateToPlace}/>:null}
    {selectedPlot?<SacredPlotPanel plot={selectedPlot} locale={locale} onClose={closePlot} onNavigate={()=>{selectPlace.current(selectedPlot.associatedSacredPlaceId,{push:true});setPlaceTab('collection');}}
      placeTitle={sacredPlaces.find(item=>item.id===selectedPlot.sacredPlaceId)?.title??selectedPlot.sacredPlaceId}
      associatedTitle={sacredPlaces.find(item=>item.id===selectedPlot.associatedSacredPlaceId)?.title??selectedPlot.associatedSacredPlaceId}/>:null}
    {mode==='globe'||mode==='calendar'?<CalendarTimeline date={date} today={today()} days={yearDays} locale={locale} playing={playing}
      labels={{play:text.play,pause:text.pause,timeline:text.timeline,noEvents:text.noEvents,events:text.events}}
      onChange={value=>{setPlaying(false);goToDate(value);}} onTogglePlay={togglePlay}/>:null}
    {mode==='journeys'?<JourneyPlayer journeys={journeys} journey={journey} schedule={journeySchedules.get(journey.id)!} tick={journeyTick} locale={locale}
      labels={{play:text.journeyStart,pause:text.pause,acts:text.acts,journeys:text.journeys,restart:text.journeyStart}}
      onSelect={id=>setJourneyId(id)} onSeek={time=>journeyLayer.current?.seek(time)}
      onTogglePlay={()=>{if(journeyTick.playing)journeyLayer.current?.pause();else{setDrawer(false);closeCard();setPlaceId(null);journeyLayer.current?.play();}}}/>:null}
    <div className={styles.cameraControls} role="toolbar" aria-label={text.view}>
      {earth?<button className={styles.roundButton} data-view-button="relief" aria-pressed={relief} aria-busy={reliefBusy} disabled={reliefBusy} title={text.relief3d} aria-label={text.relief3d} onClick={()=>void toggleRelief()}><Box size={19}/><b>3D</b></button>:null}
      <button className={styles.roundButton} data-view-button="flat" aria-pressed={mapMode} title={mapMode?text.globe3d:text.flat} aria-label={mapMode?text.globe3d:text.flat} onClick={toggleFlat}>{mapMode?<Globe2 size={19}/>:<MapIcon size={19}/>}<b>{mapMode?text.globe:'2D'}</b></button>
      <i aria-hidden className={styles.pointerOnly}/>
      <button className={`${styles.roundButton} ${styles.pointerOnly}`} title={text.north} aria-label={text.north} onClick={()=>widget.camera.flyTo({destination:widget.camera.positionWC.clone(),orientation:{heading:0,pitch:widget.camera.pitch,roll:0},duration:.8})}><Compass size={20}/></button>
      <button className={`${styles.roundButton} ${styles.pointerOnly}`} title={text.zoomIn} aria-label={text.zoomIn} onClick={()=>zoom(1)}><Plus size={20}/></button>
      <button className={`${styles.roundButton} ${styles.pointerOnly}`} title={text.zoomOut} aria-label={text.zoomOut} onClick={()=>zoom(-1)}><Minus size={20}/></button>
      <i aria-hidden/>
      <button className={styles.roundButton} title={text.showAll} aria-label={text.showAll} onClick={overview}><Globe2 size={20}/></button>
    </div>
    {mode==='history'?<nav className={styles.timeline} aria-label={text.history}><Select size="sm" aria-label={labels.year} prefix={labels.year} value={unified.year} onChange={unified.setYear} options={[{value:'',label:labels.all},...unified.years.map(year=>({value:String(year),label:String(year)}))]}/><span>{unified.events.length?`${unified.events.length} ${labels.events}`:labels.empty}</span></nav>:null}
  </div>;
}
