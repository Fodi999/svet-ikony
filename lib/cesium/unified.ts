export const globeModes=['globe','calendar','saints','churches','history','map'] as const;
export type GlobeMode=typeof globeModes[number];
export function modeFromParams(params:URLSearchParams):GlobeMode {
  const mode=params.get('mode');
  return globeModes.includes(mode as GlobeMode)?mode as GlobeMode:params.get('view')==='history'?'history':params.has('calendarDate')||params.has('date')?'calendar':'globe';
}
export const defaultLayers={countries:true,borders:true,capitals:true,cities:true,christianPlaces:true,sacredModels:true,saints:false,churches:false,monasteries:false,calendar:false,events:false,territories:false,routes:false};
export type GlobeLayers=typeof defaultLayers;
export function layersForMode(layers:GlobeLayers,mode:GlobeMode):GlobeLayers {
  return {...layers,calendar:mode==='calendar',saints:mode==='saints',churches:mode==='churches',monasteries:mode==='churches',events:mode==='history',territories:mode==='history'};
}
export function initialLayers(params:URLSearchParams):GlobeLayers {
  const defaults=layersForMode(defaultLayers,modeFromParams(params));
  if(!params.has('layers'))return defaults;
  const enabled=new Set((params.get('layers')??'').split(','));
  return Object.fromEntries(Object.keys(defaults).map(key=>[key,enabled.has(key)])) as GlobeLayers;
}
export const layerCopy={
  ru:{layers:'Слои',countries:'Страны',borders:'Границы',capitals:'Столицы',cities:'Города',saints:'Святые',churches:'Храмы',monasteries:'Монастыри',calendar:'Святые дня',events:'Исторические события',territories:'Исторические территории',routes:'Маршруты',empty:'Нет записей',year:'Год',all:'Все годы'},
  uk:{layers:'Шари',countries:'Країни',borders:'Кордони',capitals:'Столиці',cities:'Міста',saints:'Святі',churches:'Храми',monasteries:'Монастирі',calendar:'Святі дня',events:'Історичні події',territories:'Історичні території',routes:'Маршрути',empty:'Немає записів',year:'Рік',all:'Усі роки'},
  en:{layers:'Layers',countries:'Countries',borders:'Borders',capitals:'Capitals',cities:'Cities',saints:'Saints',churches:'Churches',monasteries:'Monasteries',calendar:'Saints of the day',events:'Historical events',territories:'Historical territories',routes:'Routes',empty:'No records',year:'Year',all:'All years'},
};
