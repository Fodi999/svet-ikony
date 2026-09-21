'use client';
import {useEffect,useState} from 'react';
import {Globe2,Map as MapIcon} from 'lucide-react';
import {useI18n} from '@/components/site/LanguageProvider';
import type {Basemap,EarthStreaming,EarthStreamingState} from '@/lib/cesium/earth-streaming';
import styles from './calendar-globe.module.css';

const copy={
  uk:{group:'Тип карти',satellite:'Супутник',map:'Карта',terrain:'Рельєф',buildings:'3D-будівлі'},
  ru:{group:'Тип карты',satellite:'Спутник',map:'Карта',terrain:'Рельеф',buildings:'3D-здания'},
  en:{group:'Map type',satellite:'Satellite',map:'Map',terrain:'Terrain',buildings:'3D Buildings'},
} as const;

/** Compact Satellite | Map switch (plus dev-only Terrain / 3D Buildings toggles) for the streamed Cesium Earth. */
export function EarthSourceControl({earth}:{earth:EarthStreaming|null}) {
  return earth?<Control earth={earth}/>:null;
}

function Control({earth}:{earth:EarthStreaming}) {
  const {locale}=useI18n(),text=copy[locale];
  const [state,setState]=useState<EarthStreamingState>(()=>({...earth.state}));
  useEffect(()=>earth.subscribe(setState),[earth]);
  const choose=(mode:Basemap)=>{
    try{window.localStorage.setItem('earth:basemap',mode);}catch{/* storage unavailable */}
    void earth.setBasemap(mode);
  };
  const tools=process.env.NODE_ENV==='development';
  return <div className={styles.earthControl} data-earth-control>
    <div className={styles.basemapSwitch} role="group" aria-label={text.group}>
      <button type="button" aria-pressed={state.basemap==='satellite'} onClick={()=>choose('satellite')}><Globe2 size={14}/>{text.satellite}</button>
      <button type="button" aria-pressed={state.basemap==='map'} onClick={()=>choose('map')}><MapIcon size={14}/>{text.map}</button>
    </div>
    {tools?<div className={styles.earthTools}>
      <label><input type="checkbox" data-earth-tool="terrain" checked={state.terrain} onChange={event=>void earth.setTerrain(event.target.checked)}/>{text.terrain}</label>
      <label><input type="checkbox" data-earth-tool="buildings" checked={state.buildings} onChange={event=>void earth.setBuildings(event.target.checked)}/>{text.buildings}</label>
    </div>:null}
  </div>;
}
