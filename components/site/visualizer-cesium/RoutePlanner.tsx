'use client';
import {useState} from 'react';
import {Car,ExternalLink,Footprints,LocateFixed,Navigation,X} from 'lucide-react';
import type {Route,TravelMode} from '@/lib/routes/osrm';
import styles from './route-planner.module.css';

type Locale='uk'|'ru'|'en';
export const routeCopy={
  uk:{title:'Як дістатися',fromMe:'Маршрут від мене',car:'Авто',foot:'Пішки',clear:'Сховати маршрут',locating:'Визначаємо ваше місце…',loading:'Прокладаємо маршрут…',
    denied:'Дозвольте доступ до геолокації в браузері або відкрийте маршрут у картах нижче.',unavailable:'Геолокація недоступна на цьому пристрої.',
    noRoute:'Дорожнього маршруту немає — можливо, потрібен переліт або пором.',error:'Сервіс маршрутів тимчасово недоступний.',openIn:'Відкрити в',
    privacy:'Ваше місце використовується лише для цього маршруту й не зберігається.',km:'км',m:'м',h:'год',min:'хв'},
  ru:{title:'Как добраться',fromMe:'Маршрут от меня',car:'Авто',foot:'Пешком',clear:'Скрыть маршрут',locating:'Определяем ваше место…',loading:'Прокладываем маршрут…',
    denied:'Разрешите доступ к геолокации в браузере или откройте маршрут в картах ниже.',unavailable:'Геолокация недоступна на этом устройстве.',
    noRoute:'Дорожного маршрута нет — возможно, нужен перелёт или паром.',error:'Сервис маршрутов временно недоступен.',openIn:'Открыть в',
    privacy:'Ваше место используется только для этого маршрута и не сохраняется.',km:'км',m:'м',h:'ч',min:'мин'},
  en:{title:'Getting there',fromMe:'Route from my location',car:'Car',foot:'On foot',clear:'Hide route',locating:'Finding your location…',loading:'Planning the route…',
    denied:'Allow location access in your browser, or open the route in a maps app below.',unavailable:'Location is not available on this device.',
    noRoute:'There is no road route — a flight or ferry may be needed.',error:'The routing service is temporarily unavailable.',openIn:'Open in',
    privacy:'Your location is used for this route only and is not stored.',km:'km',m:'m',h:'h',min:'min'},
} as const;

export function formatDistance(meters:number,text:{km:string;m:string}){
  return meters<1000?`${Math.round(meters/10)*10} ${text.m}`:`${(meters/1000).toFixed(meters<10_000?1:0)} ${text.km}`;
}
export function formatDuration(seconds:number,text:{h:string;min:string}){
  const minutes=Math.max(1,Math.round(seconds/60)),hours=Math.floor(minutes/60);
  return hours?`${hours} ${text.h} ${minutes%60} ${text.min}`:`${minutes} ${text.min}`;
}
/** Hand-off to navigation apps, which keep working when geolocation or our routing is unavailable. */
export function navigationLinks(lat:number,lon:number,mode:TravelMode){
  const point=`${lat},${lon}`;
  return [
    {name:'Google Maps',href:`https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=${mode==='foot'?'walking':'driving'}`},
    {name:'Apple Maps',href:`https://maps.apple.com/?daddr=${point}&dirflg=${mode==='foot'?'w':'d'}`},
    {name:'OpenStreetMap',href:`https://www.openstreetmap.org/directions?engine=fossgis_osrm_${mode==='foot'?'foot':'car'}&route=%3B${encodeURIComponent(point)}`},
  ];
}

type Status='idle'|'locating'|'loading'|'ready'|'denied'|'unavailable'|'noRoute'|'error';
type Props={
  destination:{lat:number;lon:number};locale:Locale;
  /** Draws the route on the globe (null clears it). */
  onRoute:(route:(Route&{from:{lat:number;lon:number}})|null)=>void;
};
export function RoutePlanner({destination,locale,onRoute}:Props){
  const text=routeCopy[locale];
  const [mode,setMode]=useState<TravelMode>('car'),[status,setStatus]=useState<Status>('idle'),[route,setRoute]=useState<Route|null>(null);
  const plan=(travel:TravelMode)=>{
    if(!('geolocation' in navigator)){setStatus('unavailable');return;}
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(async position=>{
      const from={lat:position.coords.latitude,lon:position.coords.longitude};
      setStatus('loading');
      try{
        const response=await fetch('/api/routes?'+new URLSearchParams({from:`${from.lat},${from.lon}`,to:`${destination.lat},${destination.lon}`,mode:travel}));
        if(!response.ok)throw new Error('route');
        const {route:found}=await response.json() as {route:Route|null};
        if(!found){setRoute(null);onRoute(null);setStatus('noRoute');return;}
        setRoute(found);onRoute({...found,from});setStatus('ready');
      }catch{setStatus('error');}
    },error=>setStatus(error.code===error.PERMISSION_DENIED?'denied':'unavailable'),{enableHighAccuracy:false,timeout:15_000,maximumAge:300_000});
  };
  const chooseMode=(next:TravelMode)=>{setMode(next);if(route||status==='noRoute')plan(next);};
  const clear=()=>{setRoute(null);setStatus('idle');onRoute(null);};
  const busy=status==='locating'||status==='loading';
  return <section className={styles.planner} aria-label={text.title} data-route-planner>
    <div className={styles.modes} role="group" aria-label={text.title}>
      <button type="button" aria-pressed={mode==='car'} onClick={()=>chooseMode('car')}><Car size={16}/>{text.car}</button>
      <button type="button" aria-pressed={mode==='foot'} onClick={()=>chooseMode('foot')}><Footprints size={16}/>{text.foot}</button>
    </div>
    {route?<div className={styles.summary} data-testid="route-summary">
      <Navigation size={18}/><strong>{formatDuration(route.duration,text)}</strong><span>{formatDistance(route.distance,text)}</span>
      <button type="button" className={styles.clear} aria-label={text.clear} title={text.clear} onClick={clear}><X size={16}/></button>
    </div>:<button type="button" className={styles.primary} disabled={busy} onClick={()=>plan(mode)}><LocateFixed size={17}/>{busy?text[status as 'locating'|'loading']:text.fromMe}</button>}
    {status==='denied'||status==='unavailable'||status==='noRoute'||status==='error'?<p className={styles.notice} role="status">{text[status]}</p>:null}
    <div className={styles.links}>
      <span>{text.openIn}</span>
      {navigationLinks(destination.lat,destination.lon,mode).map(link=><a key={link.name} href={link.href} target="_blank" rel="noreferrer">{link.name}<ExternalLink size={12}/></a>)}
    </div>
    <small className={styles.privacy}>{text.privacy} © OpenStreetMap contributors</small>
  </section>;
}
