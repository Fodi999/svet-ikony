'use client';

import {useEffect,useRef,useState} from 'react';
import type {CesiumWidget} from '@cesium/engine';
import type {CameraCommand} from '../visualizer/Earth3DCanvas';
import '@cesium/engine/Source/Widget/CesiumWidget.css';
import styles from './cesium.module.css';
import calendarStyles from './calendar-globe.module.css';
import {useI18n} from '@/components/site/LanguageProvider';
import type {CapitalCity} from '@/lib/visualizer/capital-cities';
import type {createCesiumCountries} from '@/lib/cesium/countries';
import type {KnowledgeLayer} from '@/lib/cesium/knowledge';
import type {MapEvent, SelectedEventTarget} from '../visualizer/Earth3DCanvas';
import type {HistoricalTerritory} from '@/lib/visualizer/historical-territories';
import type {createCesiumEvents} from '@/lib/cesium/events';
import {terrainZoomDistance} from '@/lib/cesium/camera';
import {CESIUM_DATA, CESIUM_RUNTIME} from '@/lib/cesium/release';
import {CalendarOverlay} from './CalendarOverlay';
import {CalendarGlobeOverlay} from './CalendarGlobeOverlay';
import {createEarthStreaming,earthStreamingEnabled,parseBasemap,type EarthStreaming} from '@/lib/cesium/earth-streaming';
import {installDevProbe} from '@/lib/cesium/dev-probe';
let nextInstanceId=0;
const liveInstances=new Set<number>();

export type CesiumCanvasProps = {
  calendarExperience?:boolean;
  cameraCommand?:CameraCommand;
  initialAlpsPreview?:boolean;
  selectedCountryCode?:string|null;
  onSelectCountry?:(code:string)=>void;
  onSelectCapital?:(city:CapitalCity)=>void;
  bordersVisible?:boolean;
  capitalsVisible?:boolean;
  mapEvents?:MapEvent[];
  selectedEvent?:SelectedEventTarget;
  historicalTerritory?:HistoricalTerritory|null;
  onSelectEvent?:(id:string)=>void;
};
export function CesiumEarthCanvas({calendarExperience=false,cameraCommand,initialAlpsPreview=false,selectedCountryCode=null,onSelectCountry,onSelectCapital,bordersVisible=true,capitalsVisible=true,mapEvents,selectedEvent,historicalTerritory,onSelectEvent}:CesiumCanvasProps) {
  const [error,setError]=useState<string|null>(null);
  const [calendarWidget,setCalendarWidget]=useState<CesiumWidget|null>(null);
  const [earth,setEarth]=useState<EarthStreaming|null>(null);
  const events=useRef<ReturnType<typeof createCesiumEvents>|null>(null);
  const historyProps=useRef({mapEvents,selectedEvent,historicalTerritory,onSelectEvent});
  useEffect(()=>{historyProps.current={mapEvents,selectedEvent,historicalTerritory,onSelectEvent};events.current?.update(mapEvents??[],selectedEvent??null);},[mapEvents,selectedEvent,historicalTerritory,onSelectEvent]);
  useEffect(()=>{events.current?.focus(selectedEvent??null);},[selectedEvent]);
  useEffect(()=>{void events.current?.territory(historicalTerritory??null).catch(e=>setError(String(e)));},[historicalTerritory]);
  const root=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null),credits=useRef<HTMLDivElement>(null),widget=useRef<CesiumWidget|null>(null);
  const countries=useRef<Awaited<ReturnType<typeof createCesiumCountries>>|null>(null),capitals=useRef<KnowledgeLayer|null>(null);
  const {locale}=useI18n();
  const props=useRef({locale,selectedCountryCode,onSelectCountry,onSelectCapital,bordersVisible,capitalsVisible});
  useEffect(()=>{props.current={locale,selectedCountryCode,onSelectCountry,onSelectCapital,bordersVisible,capitalsVisible};widget.current?.scene.requestRender();},[locale,selectedCountryCode,onSelectCountry,onSelectCapital,bordersVisible,capitalsVisible]);
  useEffect(()=>{
    let disposed=false;
    let earthController:EarthStreaming|null=null;
    installDevProbe();
    const abort=new AbortController();
    const dataBase=process.env.NODE_ENV === 'production'?CESIUM_DATA:'/api/dev/cesium/data/';
    (window as Window & {CESIUM_BASE_URL?:string}).CESIUM_BASE_URL=process.env.NODE_ENV === 'production'?CESIUM_RUNTIME:'/api/dev/cesium/';
    void import('@cesium/engine').then(C=>{
      if(disposed || !root.current)return;
      C.CreditDisplay.cesiumCredit=new C.Credit('<a href="https://cesium.com/platform/cesiumjs/">CesiumJS</a>',true);
      // The calendar globe renders every credit (Cesium ion, Google Maps, CesiumJS, data attribution) in its own bottom strip
      // instead of the default overlay inside the canvas; the attribution lightbox still opens over the whole frame.
      const creditOptions=calendarExperience&&credits.current?{creditContainer:credits.current,creditViewport:frame.current??undefined}:{};
      const instance=new C.CesiumWidget(root.current,{baseLayer:false,terrainProvider:new C.EllipsoidTerrainProvider(),
        requestRenderMode:true,maximumRenderTimeChange:Infinity,showRenderLoopErrors:false,...creditOptions});
      widget.current=instance;
      const instanceId=++nextInstanceId;liveInstances.add(instanceId);
      instance.canvas.dataset.instanceId=String(instanceId);
      if(process.env.NODE_ENV==='development')console.assert(liveInstances.size===1,'Expected one live CesiumWidget');
      if(calendarExperience&&process.env.NODE_ENV==='development')instance.scene.postRender.addEventListener(()=>{
        const position=instance.camera.positionWC;
        instance.canvas.dataset.cameraPosition=[position.x,position.y,position.z].map(value=>value.toFixed(3)).join(',');
        instance.canvas.dataset.liveInstances=String(liveInstances.size);
      });
      if(calendarExperience||process.env.NODE_ENV==='development')setCalendarWidget(instance);
      if(!calendarExperience)void import('@/lib/cesium/events').then(({createCesiumEvents})=>{
        if(disposed)return;
        const layer=createCesiumEvents(instance,id=>historyProps.current.onSelectEvent?.(id),e=>{if(!disposed)setError(String(e));});
        events.current=layer;
        layer.update(historyProps.current.mapEvents??[],historyProps.current.selectedEvent??null);
        layer.focus(historyProps.current.selectedEvent??null);
        return layer.territory(historyProps.current.historicalTerritory??null);
      }).catch(e=>{if(!disposed)setError(String(e));});
      if(!calendarExperience)void import('@/lib/cesium/countries').then(({createCesiumCountries})=>createCesiumCountries(instance,{signal:abort.signal,locale:()=>props.current.locale,onSelect:code=>props.current.onSelectCountry?.(code)})).then(layer=>{
        if(disposed){layer.dispose();return;}countries.current=layer;layer.setBorders(props.current.bordersVisible);layer.select(props.current.selectedCountryCode,!initialAlpsPreview);
      }).catch(e=>{if(!disposed)setError(String(e));});
      if(!calendarExperience)void import('@/lib/cesium/capitals').then(({createCesiumCapitals})=>createCesiumCapitals(instance,{signal:abort.signal,locale:()=>props.current.locale,reserved:()=>countries.current?.labelBoxes()??[],onSelect:city=>props.current.onSelectCapital?.(city)})).then(layer=>{
        if(disposed){layer.dispose();return;}capitals.current=layer;layer.setVisible(props.current.capitalsVisible);
      }).catch(e=>{if(!disposed)setError(String(e));});
      instance.useBrowserRecommendedResolution=false;
      instance.resolutionScale=Math.min(window.devicePixelRatio||1,2)/(window.devicePixelRatio||1);
      instance.scene.postProcessStages.fxaa.enabled=false;
      instance.scene.globe.enableLighting=true;
      instance.scene.globe.depthTestAgainstTerrain=true;
      instance.scene.screenSpaceCameraController.enableCollisionDetection=true;
      instance.scene.screenSpaceCameraController.minimumZoomDistance=10;
      // Streamed real Earth (Cesium ion imagery/terrain/buildings) only for the unified calendar globe; the
      // self-hosted NASA layer stays underneath as the low-resolution fallback and the legacy path is untouched.
      const streaming=calendarExperience&&earthStreamingEnabled(window.location.search);
      const nasa=instance.scene.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({url:`${dataBase}nasa/{z}/{x}/{y}.jpg`,
        tilingScheme:new C.GeographicTilingScheme(),maximumLevel:4,credit:'NASA Earth Observatory'}));
      if(!streaming){
        void C.CesiumTerrainProvider.fromUrl(`${dataBase}alps-heightmap/`,{requestVertexNormals:false,requestWaterMask:false}).then(provider=>{
          if(disposed)return;
          instance.terrainProvider=provider;
          instance.scene.requestRender();
        }).catch(e=>{if(!disposed)setError(`Local terrain: ${String(e)}`);});
        const sentinel=instance.scene.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({url:`${dataBase}sentinel/{z}/{x}/{y}.png`,
          tilingScheme:new C.GeographicTilingScheme(),rectangle:C.Rectangle.fromDegrees(6.7,45.75,6.98,46),minimumLevel:7,maximumLevel:13,
          credit:'Contains modified Copernicus Sentinel data 2023'}));
        sentinel.show=false;
        instance.scene.preRender.addEventListener(()=>{sentinel.show=instance.camera.positionCartographic.height<500000;});
      }else{
        const params=new URLSearchParams(window.location.search);
        let saved:string|null=null;try{saved=window.localStorage.getItem('earth:basemap');}catch{/* storage unavailable */}
        earthController=createEarthStreaming(C,instance,nasa,{basemap:parseBasemap(params.get('basemap')??saved)});
        setEarth(earthController);
        void earthController.setBasemap(earthController.state.basemap);
        if(params.get('terrain')==='1'||params.get('buildings')==='1')void earthController.setTerrain(true);
        if(params.get('buildings')==='1')void earthController.setBuildings(true);
      }
      if(calendarExperience&&process.env.NODE_ENV==='development')(window as Window&{__earth?:unknown}).__earth={widget:instance,earth:earthController,C};
      instance.camera.setView({destination:C.Cartesian3.fromDegrees(calendarExperience?16:initialAlpsPreview?6.86:12,calendarExperience?28:initialAlpsPreview?45.83:46,calendarExperience?(window.innerWidth<768?24000000:14000000):initialAlpsPreview?150000:12000000)});
      if(process.env.NODE_ENV==='development'){
        const view=new URLSearchParams(window.location.search).get('atlasView');
        const preset=view==='europe'?[12,48,4500000]:view==='egypt'?[31,27,2400000]:view==='city'?[11.34,44.5,80000]:view==='sacred'?[12.5,41.9,350000]:view==='sacred-close'?[11.86,41.4,12000]:null;
        if(preset)instance.camera.setView({destination:C.Cartesian3.fromDegrees(...preset as [number,number,number])});
        if(view==='sacred'||view==='sacred-close'){
          instance.camera.lookAt(C.Cartesian3.fromDegrees(view==='sacred'?12.82:12.5,view==='sacred'?42.14:41.9),new C.HeadingPitchRange(0,-Math.PI/4,view==='sacred'?350000:12000));
          instance.camera.lookAtTransform(C.Matrix4.IDENTITY);
        }
      }
      instance.scene.renderError.addEventListener((_scene:unknown,e:Error)=>{if(!disposed)setError(e.message);});
    }).catch(e=>{if(!disposed)setError(String(e));});
    return ()=>{disposed=true;earthController?.dispose();earthController=null;abort.abort();events.current?.dispose();events.current=null;countries.current?.dispose();countries.current=null;capitals.current?.dispose();capitals.current=null;if(widget.current){liveInstances.delete(Number(widget.current.canvas.dataset.instanceId));widget.current.destroy();}widget.current=null;};
  },[initialAlpsPreview,calendarExperience]);
  useEffect(()=>{countries.current?.select(selectedCountryCode);},[selectedCountryCode]);
  useEffect(()=>{countries.current?.setBorders(bordersVisible);},[bordersVisible]);
  useEffect(()=>{capitals.current?.setVisible(capitalsVisible);},[capitalsVisible]);
  useEffect(()=>{
    const w=widget.current;if(!w || !cameraCommand)return;
    void import('@cesium/engine').then(C=>{
      if(w.isDestroyed())return;
      w.camera.cancelFlight();
      if(cameraCommand.action==='reset') {
        w.camera.flyTo({destination:C.Cartesian3.fromDegrees(12,46,12000000)});
      } else {
        const position=w.camera.positionCartographic;
        const ray=w.camera.getPickRay(new C.Cartesian2(w.canvas.clientWidth/2,w.canvas.clientHeight/2));
        const target=ray?w.scene.globe.pick(ray,w.scene):undefined;
        const step=terrainZoomDistance(cameraCommand.action,position.height,w.scene.globe.getHeight(position),
          target?C.Cartesian3.distance(w.camera.positionWC,target):undefined);
        if(cameraCommand.action==='in')w.camera.zoomIn(step);
        else w.camera.zoomOut(step);
      }
      w.scene.requestRender();
    }).catch(e=>{if(!w.isDestroyed())setError(String(e));});
  },[cameraCommand]);
  return <div ref={frame} className={styles.root} data-visualizer-engine="cesium"><div ref={root} className={styles.canvas}/>{calendarExperience?<div ref={credits} className={calendarStyles.credits} data-cesium-credits role="contentinfo" aria-label="Map data attribution"/>:null}{calendarWidget?(calendarExperience?<CalendarGlobeOverlay widget={calendarWidget} earth={earth}/>:process.env.NODE_ENV==='development'?<CalendarOverlay widget={calendarWidget}/>:null):null}{error?<output className={styles.error}>{error}</output>:null}</div>;
}
