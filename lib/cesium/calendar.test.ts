import {describe,it,expect,vi} from 'vitest';
import * as C from '@cesium/engine';
import {calendarMarkers,calendarMarkerStyle,createOrthodoxCalendarLayer,markerModel} from './calendar';
import {sacredDemo} from './sacred-demo';
import {layerHandlerCount} from './handlers';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
vi.mock('@cesium/engine',async original=>{const a=await original<typeof import('@cesium/engine')>();return {...a,ScreenSpaceEventHandler:class{setInputAction(){}destroy(){}},SceneTransforms:{...a.SceneTransforms,worldToWindowCoordinates:()=>new a.Cartesian2(400,400)}};});
const point:CalendarGeoItem={entityId:'e',entityType:'saint',title:'Test',placeId:'p',placeTitle:'Place',relationType:'birth',lat:38,lon:35,markerPriority:70,thumbnail:null,matchStatus:'machine_high'};
// Cesium BillboardGraphics.show defaults to true when no property is set.
function billboardVisible(entity:C.Entity){return Boolean(entity.billboard)&&entity.isShowing&&(entity.billboard?.show?.getValue(C.JulianDate.now())??true);}
function mount(){
 let source:C.CustomDataSource|undefined,destroyed=false;const frame=new C.Event();
 const widget={canvas:{clientWidth:1440,clientHeight:1000,dataset:{},style:{cursor:''},title:'',addEventListener:vi.fn(),removeEventListener:vi.fn()},dataSources:{add:vi.fn(async(value:C.CustomDataSource)=>{source=value;return value;}),remove:vi.fn()},isDestroyed:()=>destroyed,
 scene:{preRender:frame,requestRender:vi.fn()},camera:{positionWC:C.Cartesian3.fromDegrees(35,38,300000),positionCartographic:{height:300000},heading:0,cancelFlight:vi.fn(),directionWC:new C.Cartesian3(0,0,-1),getPixelSize:()=>1000,flyToBoundingSphere:vi.fn()}};
 const layer=createOrthodoxCalendarLayer(widget as unknown as C.CesiumWidget,vi.fn(),vi.fn());
 return {layer,widget,frame,entities:()=>source!.entities.values,destroy:()=>{destroyed=true;}};
}
describe('Calendar native photo markers',()=>{
 it('keeps native billboards independent of the legacy models flag',()=>{const {layer,entities,frame}=mount();for(const enabled of [true,false]){layer.update([point],'all',null,enabled);frame.raiseEvent();expect(entities()[0].model).toBeUndefined();expect(billboardVisible(entities()[0])).toBe(true);}layer.dispose();});
 it('keeps permanent and calendar sources independent without allocating models',()=>{const {layer,widget,frame}=mount();const sources:C.CustomDataSource[]=[];widget.dataSources.add.mockImplementation(async source=>{sources.push(source);return source;});const second=createOrthodoxCalendarLayer(widget as unknown as C.CesiumWidget,vi.fn(),vi.fn(),{name:'ChristianPlaces'});layer.update(Array.from({length:20},(_,i)=>({...point,entityId:'a'+i})));second.update(Array.from({length:20},(_,i)=>({...point,entityId:'b'+i})));frame.raiseEvent();expect(sources[0].entities.values).toHaveLength(20);expect(sources[0].entities.values.every(e=>e.billboard&&!e.model)).toBe(true);layer.setVisible(false);layer.update([]);frame.raiseEvent();expect(sources[0].show).toBe(true);expect(sources[0].entities.values).toHaveLength(20);layer.dispose();second.dispose();});
 it('uses restrained points and only available thumbnails',()=>{expect(calendarMarkerStyle(point,false).pixelSize).toBe(4);expect(calendarMarkerStyle({...point,markerPriority:90},false).pixelSize).toBe(7);expect(calendarMarkerStyle(point,true).thumbnail).toBe(false);expect(calendarMarkerStyle({...point,thumbnail:'https://example.org/a.jpg'},true).thumbnail).toBe(true);});
 it('deduplicates relations without losing places',()=>expect(calendarMarkers([point,{...point,relationType:'death'},{...point,placeId:'p2'}])).toHaveLength(2));
 it('filters categories and invalid coordinates',()=>{expect(calendarMarkers([point],'icon')).toEqual([]);expect(calendarMarkers([{...point,lat:NaN},{...point,lon:181}])).toEqual([]);});
 it('handles dense days',()=>expect(calendarMarkers(Array.from({length:500},(_,i)=>({...point,entityId:'s'+i%50})))).toHaveLength(50));
 it('clears dates and safely disposes after widget destruction',()=>{vi.stubGlobal('window',{matchMedia:()=>({matches:false})});try{const {layer,entities,widget,destroy}=mount();layer.update([point]);expect(entities()).toHaveLength(1);layer.update([]);expect(entities()).toHaveLength(0);layer.focus([]);expect(widget.camera.flyToBoundingSphere).not.toHaveBeenCalled();layer.focus([point]);expect(widget.camera.flyToBoundingSphere).toHaveBeenCalledOnce();destroy();expect(()=>layer.dispose()).not.toThrow();expect(widget.dataSources.remove).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}});
 it('maps six explicit families, never assigns arbitrary figures',()=>{for(const [type,family] of Object.entries({saint:'saint',church:'church',cathedral:'church',icon:'icon',relic:'icon',pilgrimage_route:'knight',historical_movement:'knight',monastery:'monastery',major_sacred_place:'major'}))expect(markerModel(type)).toBe('/markers/sacred/marker-'+family+'.glb');expect(markerModel('unknown')).toBeUndefined();expect(markerModel('feast')).toBeUndefined();});
 it('does not allocate far models',()=>{const {layer,frame,widget,entities}=mount();widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,14000000);layer.update([point]);frame.raiseEvent();expect(entities()[0].model).toBeUndefined();expect(billboardVisible(entities()[0])).toBe(true);});
 it('retains ground-clamped billboards at near and far distances',()=>{const {layer,frame,widget,entities}=mount();layer.update([point]);const e=entities()[0],billboard=e.billboard;expect(billboard?.heightReference?.getValue()).toBe(C.HeightReference.CLAMP_TO_GROUND);
  for(const height of [9000000,300000]){widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,height);frame.raiseEvent();expect(e.billboard).toBe(billboard);expect(billboardVisible(e)).toBe(true);expect(e.model).toBeUndefined();}layer.dispose();
 });
 it('survives 20 far/near switches without recreating the billboard',()=>{
  const {layer,frame,widget,entities}=mount();layer.update([point]);frame.raiseEvent();
  const e=entities()[0],billboard=e.billboard;expect(billboard).toBeDefined();
  for(let i=0;i<20;i++){
   widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,i%2===0?9000000:300000);
   frame.raiseEvent();
   expect(e.billboard).toBe(billboard);
   expect(billboardVisible(e)).toBe(true);
   expect(e.model).toBeUndefined();
  }
 });
 it('reuses every billboard across 1, 10 and 20 simultaneous markers',()=>{
  for(const count of [1,10,20]){
   const {layer,frame,widget,entities}=mount();
   layer.update(Array.from({length:count},(_,i)=>({...point,entityId:'m'+i,lon:35+i*.01})));
   frame.raiseEvent();
   const billboards=entities().map(e=>e.billboard);
   expect(billboards.every(m=>m!==undefined)).toBe(true);
   widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,9000000);frame.raiseEvent();
   widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,300000);frame.raiseEvent();
   entities().forEach((e,i)=>{expect(e.billboard).toBe(billboards[i]);expect(e.model).toBeUndefined();});
   layer.dispose();
  }
 });
 it('keeps unmapped types as billboards near',()=>{const {layer,frame,entities}=mount();layer.update([{...point,entityType:'feast'}]);frame.raiseEvent();expect(entities()[0].model).toBeUndefined();expect(billboardVisible(entities()[0])).toBe(true);});
 it('uses distinct selected artwork and a separate ground-clamped history cell',()=>{const {layer,frame,entities}=mount();layer.update([point]);const normal=entities()[0].billboard?.image?.getValue();layer.update([point],'all','e');frame.raiseEvent();expect(entities()).toHaveLength(2);expect(entities()[0].billboard?.image?.getValue()).not.toEqual(normal);expect(entities()[1].polyline?.clampToGround?.getValue()).toBe(true);expect(entities()[1].properties?.calendarEntityId.getValue()).toBe('e');layer.dispose();});
 it('retains geographic position, depth occlusion and selection mapping',()=>{const {layer,frame,entities}=mount();layer.update([point]);frame.raiseEvent();const e=entities()[0],position=C.Cartographic.fromCartesian(e.position!.getValue(C.JulianDate.now())!);expect(C.Math.toDegrees(position.latitude)).toBeCloseTo(point.lat,6);expect(C.Math.toDegrees(position.longitude)).toBeCloseTo(point.lon,6);expect(e.billboard?.disableDepthTestDistance?.getValue()).toBe(0);expect(e.properties?.calendarEntityId.getValue()).toBe('e');layer.dispose();});
 it('renders all 40 native markers without allocating any GLB models',()=>{const {layer,frame,entities}=mount();layer.update(Array.from({length:40},(_,i)=>({...point,entityId:'s'+i,lon:35+i*.001})));frame.raiseEvent();expect(entities()).toHaveLength(40);expect(entities().filter(e=>e.model)).toHaveLength(0);expect(entities().filter(e=>billboardVisible(e))).toHaveLength(40);expect(new Set(entities().map(e=>e.properties?.calendarEntityId.getValue())).size).toBe(40);layer.dispose();});
 it('does not accumulate entities or handlers',()=>{const {layer,widget,entities,frame}=mount();for(let i=0;i<5;i++){layer.update([point]);frame.raiseEvent();}expect(entities()).toHaveLength(1);layer.setVisible(false);frame.raiseEvent();expect(entities()[0].isShowing).toBe(false);layer.dispose();layer.dispose();expect(widget.dataSources.remove).toHaveBeenCalledOnce();expect(widget.canvas.removeEventListener).toHaveBeenCalledWith('mouseleave',expect.any(Function));expect(frame.numberOfListeners).toBe(0);expect(layerHandlerCount(widget as unknown as C.CesiumWidget)).toBe(0);});
 it('never enables fixtures on remote or production',()=>{expect(sacredDemo(new URLSearchParams('sacredDemo=25'),'svetikony.com')).toBeNull();vi.stubEnv('NODE_ENV','production');expect(sacredDemo(new URLSearchParams('sacredDemo=25'),'localhost')).toBeNull();vi.unstubAllEnvs();});
});
