export const globeModes=['globe','calendar','saints','churches','history','map'] as const;
export type GlobeMode=typeof globeModes[number];
export function modeFromParams(params:URLSearchParams):GlobeMode {
  const mode=params.get('mode');
  return globeModes.includes(mode as GlobeMode)?mode as GlobeMode:params.get('view')==='history'?'history':params.has('calendarDate')||params.has('date')?'calendar':'globe';
}
// Sacred Place pilot URL state -- independent of `mode`/`entity`: marker,
// territory polygon and SacredPlacePanel all key off calendar_geo_places.id
// via `place`, never the calendar entity id (and never the unrelated
// christianPlaces chess-marker demo's `selected==='place:<id>'` convention).
export const placeTabs=['about','collection','history','directions'] as const;
export type PlaceTab=typeof placeTabs[number];
export function placeFromParams(params:URLSearchParams):string|null {
  return params.get('place');
}
export function tabFromParams(params:URLSearchParams):PlaceTab {
  const tab=params.get('tab');
  return (placeTabs as readonly string[]).includes(tab??'')?tab as PlaceTab:'about';
}
// Permanent geographic objects are independent of the calendar date.
export const defaultLayers={countries:true,borders:true,capitals:true,cities:true,christianPlaces:true,sacredModels:false,sacredPlots:true,saints:true,churches:true,monasteries:true,calendar:false,events:false,territories:false,routes:false};
export type GlobeLayers=typeof defaultLayers;
export function layersForMode(layers:GlobeLayers,mode:GlobeMode):GlobeLayers {
  return {...layers,calendar:mode==='calendar',events:mode==='history',territories:mode==='history'};
}
export function initialLayers(params:URLSearchParams):GlobeLayers {
  const defaults=layersForMode(defaultLayers,modeFromParams(params));
  if(!params.has('layers'))return defaults;
  const enabled=new Set((params.get('layers')??'').split(','));
  return Object.fromEntries(Object.keys(defaults).map(key=>[key,enabled.has(key)])) as GlobeLayers;
}
export const layerStorageKey='svetikony.globe.layers.v1';
export function restoreLayers(params:URLSearchParams,saved:unknown):GlobeLayers {
  if(params.has('layers'))return initialLayers(params);
  const defaults=initialLayers(params);
  if(!saved||typeof saved!=='object'||Array.isArray(saved))return defaults;
  const values=saved as Record<string,unknown>;
  return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,typeof values[key]==='boolean'?values[key]:value])) as GlobeLayers;
}
export function readLayers(params:URLSearchParams):GlobeLayers {
  try{return restoreLayers(params,JSON.parse(window.localStorage.getItem(layerStorageKey)??'null'));}
  catch{return initialLayers(params);}
}
export const layerCopy={
  ru:{layers:'Слои',countries:'Страны',borders:'Границы',capitals:'Столицы',cities:'Города',saints:'Святые',churches:'Храмы',monasteries:'Монастыри',calendar:'Святые дня',events:'Исторические события',territories:'Исторические территории',routes:'Маршруты',sacredPlots:'Sacred Plots',empty:'Нет записей',year:'Год',all:'Все годы'},
  uk:{layers:'Шари',countries:'Країни',borders:'Кордони',capitals:'Столиці',cities:'Міста',saints:'Святі',churches:'Храми',monasteries:'Монастирі',calendar:'Святі дня',events:'Історичні події',territories:'Історичні території',routes:'Маршрути',sacredPlots:'Sacred Plots',empty:'Немає записів',year:'Рік',all:'Усі роки'},
  en:{layers:'Layers',countries:'Countries',borders:'Borders',capitals:'Capitals',cities:'Cities',saints:'Saints',churches:'Churches',monasteries:'Monasteries',calendar:'Saints of the day',events:'Historical events',territories:'Historical territories',routes:'Routes',sacredPlots:'Sacred Plots',empty:'No records',year:'Year',all:'All years'},
};
