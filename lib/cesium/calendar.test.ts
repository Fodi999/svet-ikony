import {describe,it,expect,vi} from 'vitest';
import * as C from '@cesium/engine';
import {calendarMarkers,calendarMarkerStyle,createOrthodoxCalendarLayer,markerModel} from './calendar';
import {calendarModelGraphics,MODEL_SELECTED_FACTOR,MAX_ACTIVE_MODELS} from './sacred-markers';
import {sacredDemo} from './sacred-demo';
import {layerHandlerCount} from './handlers';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
vi.mock('@cesium/engine',async original=>{const a=await original<typeof import('@cesium/engine')>();return {...a,ScreenSpaceEventHandler:class{setInputAction(){}destroy(){}},SceneTransforms:{...a.SceneTransforms,worldToWindowCoordinates:()=>new a.Cartesian2(400,400)}};});
const point:CalendarGeoItem={entityId:'e',entityType:'saint',title:'Test',placeId:'p',placeTitle:'Place',relationType:'birth',lat:38,lon:35,markerPriority:70,thumbnail:null,matchStatus:'machine_high'};
function mount(){
 let source:C.CustomDataSource|undefined,destroyed=false;const frame=new C.Event();
 const widget={canvas:{clientWidth:1440,clientHeight:1000,dataset:{}},dataSources:{add:vi.fn(async(value:C.CustomDataSource)=>{source=value;return value;}),remove:vi.fn()},isDestroyed:()=>destroyed,
 scene:{preRender:frame,requestRender:vi.fn()},camera:{positionWC:C.Cartesian3.fromDegrees(35,38,300000),directionWC:new C.Cartesian3(0,0,-1),getPixelSize:()=>1000,flyToBoundingSphere:vi.fn()}};
 const layer=createOrthodoxCalendarLayer(widget as unknown as C.CesiumWidget,vi.fn(),vi.fn());
 return {layer,widget,frame,entities:()=>source!.entities.values,destroy:()=>{destroyed=true;}};
}
describe('Calendar markers and Sacred GLB',()=>{
 it('turns off GLB independently while keeping native billboards',()=>{const {layer,entities,frame}=mount();layer.update([point]);frame.raiseEvent();expect(entities()[0].model).toBeDefined();layer.update([point],'all',null,false);frame.raiseEvent();expect(entities()[0].model).toBeUndefined();expect(entities()[0].billboard?.show?.getValue()).toBe(true);});
 it('shares the 25-model budget across separate sources',()=>{const {layer,widget,frame}=mount();const sources:C.CustomDataSource[]=[];widget.dataSources.add.mockImplementation(async source=>{sources.push(source);return source;});const second=createOrthodoxCalendarLayer(widget as unknown as C.CesiumWidget,vi.fn(),vi.fn(),{name:'ChristianPlaces'});layer.update(Array.from({length:20},(_,i)=>({...point,entityId:'a'+i})));second.update(Array.from({length:20},(_,i)=>({...point,entityId:'b'+i})));frame.raiseEvent();expect(sources[0].entities.values.filter(e=>e.model)).toHaveLength(5);layer.setVisible(false);frame.raiseEvent();frame.raiseEvent();expect(sources[0].entities.values.filter(e=>e.model)).toHaveLength(20);layer.dispose();second.dispose();});
 it('uses restrained points and only available thumbnails',()=>{expect(calendarMarkerStyle(point,false).pixelSize).toBe(4);expect(calendarMarkerStyle({...point,markerPriority:90},false).pixelSize).toBe(7);expect(calendarMarkerStyle(point,true).thumbnail).toBe(false);expect(calendarMarkerStyle({...point,thumbnail:'https://example.org/a.jpg'},true).thumbnail).toBe(true);});
 it('deduplicates relations without losing places',()=>expect(calendarMarkers([point,{...point,relationType:'death'},{...point,placeId:'p2'}])).toHaveLength(2));
 it('filters categories and invalid coordinates',()=>{expect(calendarMarkers([point],'icon')).toEqual([]);expect(calendarMarkers([{...point,lat:NaN},{...point,lon:181}])).toEqual([]);});
 it('handles dense days',()=>expect(calendarMarkers(Array.from({length:500},(_,i)=>({...point,entityId:'s'+i%50})))).toHaveLength(50));
 it('clears dates and safely disposes after widget destruction',()=>{const {layer,entities,widget,destroy}=mount();layer.update([point]);expect(entities()).toHaveLength(1);layer.update([]);expect(entities()).toHaveLength(0);layer.focus([]);expect(widget.camera.flyToBoundingSphere).not.toHaveBeenCalled();layer.focus([point]);expect(widget.camera.flyToBoundingSphere).toHaveBeenCalledOnce();destroy();expect(()=>layer.dispose()).not.toThrow();expect(widget.dataSources.remove).not.toHaveBeenCalled();});
 it('maps six explicit families, never assigns arbitrary figures',()=>{for(const [type,family] of Object.entries({saint:'saint',church:'church',cathedral:'church',icon:'icon',relic:'icon',pilgrimage_route:'knight',historical_movement:'knight',monastery:'monastery',major_sacred_place:'major'}))expect(markerModel(type)).toBe('/markers/sacred/marker-'+family+'.glb');expect(markerModel('unknown')).toBeUndefined();expect(markerModel('feast')).toBeUndefined();});
 it('does not allocate far models',()=>{const {layer,frame,widget,entities}=mount();widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,14000000);layer.update([point]);frame.raiseEvent();expect(entities()[0].model).toBeUndefined();expect(entities()[0].billboard?.show?.getValue()).toBe(true);});
 it('attaches near models and restores far billboards',()=>{const {layer,frame,widget,entities}=mount();layer.update([point]);frame.raiseEvent();const e=entities()[0];const model=e.model;expect(model?.uri?.getValue()).toBe(markerModel('saint'));expect(model?.heightReference?.getValue()).toBe(C.HeightReference.CLAMP_TO_GROUND);expect(e.billboard?.show?.getValue()).toBe(false);widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,9000000);frame.raiseEvent();
  // Going far must hide, never destroy, the ModelGraphics -- recreating it
  // would make Cesium reload the GLB from scratch on the next near pass.
  expect(e.model).toBe(model);expect(e.model?.show?.getValue()).toBe(false);expect(e.billboard?.show?.getValue()).toBe(true);
  widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,300000);frame.raiseEvent();
  expect(e.model).toBe(model);expect(e.model?.show?.getValue()).toBe(true);expect(e.billboard?.show?.getValue()).toBe(false);
 });
 it('survives 20 far/near switches on the same marker without ever recreating the model',()=>{
  const {layer,frame,widget,entities}=mount();layer.update([point]);frame.raiseEvent();
  const e=entities()[0],model=e.model;expect(model).toBeDefined();
  for(let i=0;i<20;i++){
   widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,i%2===0?9000000:300000);
   frame.raiseEvent();
   expect(e.model).toBe(model);
   expect(e.model?.show?.getValue()).toBe(i%2!==0);
  }
 });
 it('reuses every model across 1, 10 and 20 simultaneous markers switching far/near together',()=>{
  for(const count of [1,10,20]){
   const {layer,frame,widget,entities}=mount();
   layer.update(Array.from({length:count},(_,i)=>({...point,entityId:'m'+i,lon:35+i*.01})));
   frame.raiseEvent();
   const models=entities().map(e=>e.model);
   expect(models.every(m=>m!==undefined)).toBe(true);
   widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,9000000);frame.raiseEvent();
   widget.camera.positionWC=C.Cartesian3.fromDegrees(35,38,300000);frame.raiseEvent();
   entities().forEach((e,i)=>expect(e.model).toBe(models[i]));
  }
 });
 it('keeps unmapped types as billboards near',()=>{const {layer,frame,entities}=mount();layer.update([{...point,entityType:'feast'}]);frame.raiseEvent();expect(entities()[0].model).toBeUndefined();expect(entities()[0].billboard?.show?.getValue()).toBe(true);});
 it('uses selected scale and ground ring',()=>{expect(Number(calendarModelGraphics('x',true).scale)/Number(calendarModelGraphics('x',false).scale)).toBeCloseTo(MODEL_SELECTED_FACTOR);const {layer,frame,entities}=mount();layer.update([point],'all','e');frame.raiseEvent();expect(entities()[0].polyline?.clampToGround?.getValue()).toBe(true);expect(entities()[0].model?.silhouetteSize?.getValue()).toBe(1);});
 it('aligns local up and retains selection mapping',()=>{const {layer,frame,entities}=mount();layer.update([point]);frame.raiseEvent();const e=entities()[0],time=C.JulianDate.now();const up=C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(e.orientation!.getValue(time)!),C.Cartesian3.UNIT_Z,new C.Cartesian3());expect(C.Cartesian3.dot(up,C.Ellipsoid.WGS84.geodeticSurfaceNormal(e.position!.getValue(time)!))).toBeCloseTo(1,6);expect(e.properties?.calendarEntityId.getValue()).toBe('e');});
 it('caps near models at25 with fallback overflow and shared URL',()=>{const {layer,frame,entities}=mount();layer.update(Array.from({length:40},(_,i)=>({...point,entityId:'s'+i,lon:35+i*.001})));frame.raiseEvent();expect(entities().filter(e=>e.model)).toHaveLength(MAX_ACTIVE_MODELS);expect(entities().filter(e=>e.billboard?.show?.getValue())).toHaveLength(15);expect(new Set(entities().flatMap(e=>e.model?[e.model.uri?.getValue()]:[])).size).toBe(1);});
 it('does not accumulate entities or handlers',()=>{const {layer,widget,entities,frame}=mount();for(let i=0;i<5;i++){layer.update([point]);frame.raiseEvent();}expect(entities()).toHaveLength(1);layer.setVisible(false);frame.raiseEvent();expect(entities()[0].model?.show?.getValue()).toBe(false);layer.dispose();layer.dispose();expect(widget.dataSources.remove).toHaveBeenCalledOnce();expect(frame.numberOfListeners).toBe(0);expect(layerHandlerCount(widget as unknown as C.CesiumWidget)).toBe(0);});
 it('never enables fixtures on remote or production',()=>{expect(sacredDemo(new URLSearchParams('sacredDemo=25'),'svetikony.com')).toBeNull();vi.stubEnv('NODE_ENV','production');expect(sacredDemo(new URLSearchParams('sacredDemo=25'),'localhost')).toBeNull();vi.unstubAllEnvs();});
});
