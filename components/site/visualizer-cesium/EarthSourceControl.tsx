'use client';
import {useEffect,useId,useState} from 'react';
import {Building2,ChevronDown,Globe2,Mountain,Settings2,Signpost,Sun} from 'lucide-react';
import {useI18n} from '@/components/site/LanguageProvider';
import type {Basemap,EarthStreaming,EarthStreamingState} from '@/lib/cesium/earth-streaming';
import styles from './calendar-globe.module.css';
import panel from './earth-source-control.module.css';

const copy={
  uk:{group:'Вигляд карти',satellite:'Супутник',streets:'З вулицями',terrain:'Рельєф',buildings:'3D-будівлі',sun:'Сонячне світло',error:'Не вдалося змінити вигляд карти'},
  ru:{group:'Вид карты',satellite:'Спутник',streets:'С улицами',terrain:'Рельеф',buildings:'3D-здания',sun:'Солнечный свет',error:'Не удалось изменить вид карты'},
  en:{group:'Map appearance',satellite:'Satellite',streets:'With streets',terrain:'Terrain',buildings:'3D buildings',sun:'Sunlight',error:'Could not change map appearance'},
} as const;
type Props={earth:EarthStreaming|null;sun:boolean;onSunChange:()=>void};

export function EarthSourceControl({earth,...lighting}:Props) {
  return earth?<Control earth={earth} {...lighting}/>:null;
}

function Control({earth,sun,onSunChange}:Props&{earth:EarthStreaming}) {
  const {locale}=useI18n(),text=copy[locale],id=useId();
  const [state,setState]=useState<EarthStreamingState>(()=>({...earth.state}));
  const [open,setOpen]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState(false);
  useEffect(()=>earth.subscribe(setState),[earth]);
  async function run(action:()=>Promise<unknown>){
    setPending(true);setError(false);
    try{await action();}catch{setError(true);}finally{setPending(false);}
  }
  const choose=(mode:Basemap)=>run(async()=>{
    await earth.setBasemap(mode);
    try{window.localStorage.setItem('earth:basemap',mode);}catch{/* Storage is optional. */}
  });
  const tools=process.env.NODE_ENV==='development';
  return <section className={styles.earthControl} data-earth-control aria-label={text.group}>
    <div className={panel.panel}>
      <button type="button" className={panel.heading} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><Settings2 size={16}/><span>{text.group}</span><ChevronDown size={16} className={open?panel.expanded:undefined}/></button>
      <div id={id} hidden={!open} className={panel.content}>
        <div className={panel.modes} role="group" aria-label={text.group}>
          <button type="button" disabled={pending} aria-pressed={state.basemap==='satellite'} onClick={()=>void choose('satellite')}><Globe2 size={17}/>{text.satellite}</button>
          <button type="button" disabled={pending} aria-pressed={state.basemap==='streets'} onClick={()=>void choose('streets')}><Signpost size={17}/>{text.streets}</button>
        </div>
        {tools?<div className={panel.rows}>
          <label><Mountain size={17}/><span>{text.terrain}</span><input role="switch" type="checkbox" data-earth-tool="terrain" disabled={pending} checked={state.terrain} onChange={event=>void run(()=>earth.setTerrain(event.target.checked))}/></label>
          <label><Building2 size={17}/><span>{text.buildings}</span><input role="switch" type="checkbox" data-earth-tool="buildings" disabled={pending} checked={state.buildings} onChange={event=>void run(()=>earth.setBuildings(event.target.checked))}/></label>
        </div>:null}
        <div className={panel.rows}><label><Sun size={17}/><span>{text.sun}</span><input role="switch" type="checkbox" checked={sun} onChange={onSunChange}/></label></div>
        {error||state.error?<p className={panel.error} role="alert">{text.error}</p>:null}
      </div>
    </div>
  </section>;
}
