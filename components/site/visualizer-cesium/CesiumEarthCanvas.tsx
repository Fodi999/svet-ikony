'use client';

import {useEffect,useRef,useState} from 'react';
import type {CesiumWidget} from '@cesium/engine';
import type {CameraCommand} from '../visualizer/Earth3DCanvas';
import '@cesium/engine/Source/Widget/CesiumWidget.css';
import styles from './cesium.module.css';
import {useI18n} from '@/components/site/LanguageProvider';
import type {CapitalCity} from '@/lib/visualizer/capital-cities';
import type {createCesiumCountries} from '@/lib/cesium/countries';
import type {KnowledgeLayer} from '@/lib/cesium/knowledge';
import type {MapEvent, SelectedEventTarget} from '../visualizer/Earth3DCanvas';
import type {HistoricalTerritory} from '@/lib/visualizer/historical-territories';
import type {createCesiumEvents} from '@/lib/cesium/events';
import {terrainZoomDistance} from '@/lib/cesium/camera';
import {CESIUM_DATA, CESIUM_RUNTIME} from '@/lib/cesium/release';

export type CesiumCanvasProps = {
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
export function CesiumEarthCanvas({cameraCommand,initialAlpsPreview=false,selectedCountryCode=null,onSelectCountry,onSelectCapital,bordersVisible=true,capitalsVisible=true,mapEvents,selectedEvent,historicalTerritory,onSelectEvent}:CesiumCanvasProps) {
  const [error,setError]=useState<string|null>(null);
  const events=useRef<ReturnType<typeof createCesiumEvents>|null>(null);
  const historyProps=useRef({mapEvents,selectedEvent,historicalTerritory,onSelectEvent});
  useEffect(()=>{historyProps.current={mapEvents,selectedEvent,historicalTerritory,onSelectEvent};events.current?.update(mapEvents??[],selectedEvent??null);},[mapEvents,selectedEvent,historicalTerritory,onSelectEvent]);
  useEffect(()=>{events.current?.focus(selectedEvent??null);},[selectedEvent]);
  useEffect(()=>{void events.current?.territory(historicalTerritory??null).catch(e=>setError(String(e)));},[historicalTerritory]);
  const root=useRef<HTMLDivElement>(null),widget=useRef<CesiumWidget|null>(null);
  const countries=useRef<Awaited<ReturnType<typeof createCesiumCountries>>|null>(null),capitals=useRef<KnowledgeLayer|null>(null);
  const {locale}=useI18n();
  const props=useRef({locale,selectedCountryCode,onSelectCountry,onSelectCapital,bordersVisible,capitalsVisible});
  useEffect(()=>{props.current={locale,selectedCountryCode,onSelectCountry,onSelectCapital,bordersVisible,capitalsVisible};widget.current?.scene.requestRender();},[locale,selectedCountryCode,onSelectCountry,onSelectCapital,bordersVisible,capitalsVisible]);
  useEffect(()=>{
    let disposed=false;
    const abort=new AbortController();
    const dataBase=process.env.NODE_ENV === 'production'?CESIUM_DATA:'/api/dev/cesium/data/';
    (window as Window & {CESIUM_BASE_URL?:string}).CESIUM_BASE_URL=process.env.NODE_ENV === 'production'?CESIUM_RUNTIME:'/api/dev/cesium/';
    void import('@cesium/engine').then(C=>{
      if(disposed || !root.current)return;
      C.CreditDisplay.cesiumCredit=new C.Credit('<a href="https://cesium.com/platform/cesiumjs/">CesiumJS</a>',true);
      const instance=new C.CesiumWidget(root.current,{baseLayer:false,terrainProvider:new C.EllipsoidTerrainProvider(),
        requestRenderMode:true,maximumRenderTimeChange:Infinity,showRenderLoopErrors:false});
      widget.current=instance;
      void import('@/lib/cesium/events').then(({createCesiumEvents})=>{
        if(disposed)return;
        const layer=createCesiumEvents(instance,id=>historyProps.current.onSelectEvent?.(id),e=>{if(!disposed)setError(String(e));});
        events.current=layer;
        layer.update(historyProps.current.mapEvents??[],historyProps.current.selectedEvent??null);
        layer.focus(historyProps.current.selectedEvent??null);
        return layer.territory(historyProps.current.historicalTerritory??null);
      }).catch(e=>{if(!disposed)setError(String(e));});
      void import('@/lib/cesium/countries').then(({createCesiumCountries})=>createCesiumCountries(instance,{signal:abort.signal,locale:()=>props.current.locale,onSelect:code=>props.current.onSelectCountry?.(code)})).then(layer=>{
        if(disposed){layer.dispose();return;}countries.current=layer;layer.setBorders(props.current.bordersVisible);layer.select(props.current.selectedCountryCode,!initialAlpsPreview);
      }).catch(e=>{if(!disposed)setError(String(e));});
      void import('@/lib/cesium/capitals').then(({createCesiumCapitals})=>createCesiumCapitals(instance,{signal:abort.signal,locale:()=>props.current.locale,reserved:()=>countries.current?.labelBoxes()??[],onSelect:city=>props.current.onSelectCapital?.(city)})).then(layer=>{
        if(disposed){layer.dispose();return;}capitals.current=layer;layer.setVisible(props.current.capitalsVisible);
      }).catch(e=>{if(!disposed)setError(String(e));});
      instance.resolutionScale=Math.min(window.devicePixelRatio || 1,1.5);
      instance.scene.globe.enableLighting=true;
      instance.scene.globe.depthTestAgainstTerrain=true;
      instance.scene.screenSpaceCameraController.enableCollisionDetection=true;
      instance.scene.screenSpaceCameraController.minimumZoomDistance=10;
      instance.scene.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({url:`${dataBase}nasa/{z}/{x}/{y}.jpg`,
        tilingScheme:new C.GeographicTilingScheme(),maximumLevel:4,credit:'NASA Earth Observatory'}));
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
      instance.camera.setView({destination:C.Cartesian3.fromDegrees(initialAlpsPreview?6.86:12,initialAlpsPreview?45.83:46,initialAlpsPreview?150000:12000000)});
      instance.scene.renderError.addEventListener((_scene:unknown,e:Error)=>{if(!disposed)setError(e.message);});
    }).catch(e=>{if(!disposed)setError(String(e));});
    return ()=>{disposed=true;abort.abort();events.current?.dispose();events.current=null;countries.current?.dispose();countries.current=null;capitals.current?.dispose();capitals.current=null;widget.current?.destroy();widget.current=null;};
  },[initialAlpsPreview]);
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
  return <div className={styles.root} data-visualizer-engine="cesium"><div ref={root} className={styles.canvas}/>{error?<output className={styles.error}>{error}</output>:null}</div>;
}
