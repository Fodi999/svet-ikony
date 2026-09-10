import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneCamera } from './base-scene';
import { TerrainLoader, type LoadedManifest } from './terrain-loader';
import { terrainRootMatrix, terrainAnchorErrors, type TerrainCoordinates } from './terrain-alignment';
import { INITIAL_TERRAIN, terrainAllowed, type TerrainStatus } from './terrain-state';
import { animateCountryCamera } from './country-camera';
import { TerrainStream } from './terrain-stream';
import { latLngToVector3 } from './geography';

type Context = { prepare:(root:THREE.Group)=>Promise<unknown>; frame:THREE.Group; earth:THREE.Group; borders:THREE.LineSegments; controls:OrbitControls; camera:()=>SceneCamera; ready:()=>boolean; flying:()=>boolean; cancelFly:()=>void; reducedMotion:()=>boolean; notify:(state:TerrainStatus)=>void };
const MANIFEST='/terrain/eastern_europe_test/L1/manifest.json';
export function createTerrainController(ctx:Context) {
  let state={...INITIAL_TERRAIN}, selected:string|null=null, suppressed=false, disposed=false;
  let root:THREE.Group|null=null, manifest:LoadedManifest|null=null, stream:TerrainStream|null=null;
  const worldCenter=new THREE.Vector3(),collisionOffset=new THREE.Vector3();
  const cloudVisibility=new Map<THREE.Object3D,boolean>();
  let lastUi=0,lastSummary='';
  let mix=0, destination=0, debugBorders=false, attempted=false, flight:(()=>void)|null=null;
  let oldMin=ctx.controls.minDistance, oldMaxZoom=ctx.controls.maxZoom, oldNear=ctx.camera().near;
  let userZoomed=false;
  const cloudOpacity=new Map<THREE.Material,number>();
  let collisionRadius=0;

  const earthColors=new Map<THREE.Color,THREE.Color>();
  const loader=new TerrainLoader(progress=>{state={...state,...progress};notify();});
  function notify(){if(!disposed)ctx.notify({...state});}
  const mobileQuery=window.matchMedia('(max-width: 767px), (pointer: coarse)');
  function allowed(){
    if(mobileQuery.matches&&!userZoomed)return false;
    const nav=navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}};
    const mem=(performance as Performance & {memory?:{usedJSHeapSize:number;jsHeapSizeLimit:number}}).memory;
    const camera=ctx.camera(),radius=Number(ctx.borders.userData.earthRadius);
    const zoomed=camera instanceof THREE.OrthographicCamera?camera.zoom>=3:camera.position.distanceTo(ctx.controls.target)<radius*1.9;
    const mobile=mobileQuery.matches;
    return (!mobile||userZoomed) && terrainAllowed({mobile:mobileQuery.matches,memory:nav.deviceMemory,cores:nav.hardwareConcurrency,saveData:nav.connection?.saveData,usedHeap:mem?.usedJSHeapSize,heapLimit:mem?.jsHeapSizeLimit},zoomed);
  }
  async function preload(){
    if(attempted||disposed||!ctx.ready()||!allowed())return;
    attempted=true;state.loading=true;state.error=false;notify();
    try{
      manifest=await loader.loadTerrainManifest(MANIFEST);
      if(disposed)return;
      const mobile=mobileQuery.matches;
      stream=new TerrainStream(manifest,Number(ctx.borders.userData.earthRadius),mobile,ctx.prepare);
      root=stream.root;
      root.matrix.copy(terrainRootMatrix(manifest,Number(ctx.borders.userData.earthRadius),ctx.borders.position));root.matrixAutoUpdate=false;
      root.visible=false;ctx.frame.add(root);
      stream.setBorders(debugBorders);
      const coords=manifest.coordinateSystem as TerrainCoordinates;
      const maxHeight=Math.max(...manifest.tiles.map(t=>Number(t.height_max)||0));
      collisionRadius=Number(ctx.borders.userData.earthRadius)*(1+(maxHeight*coords.heightExaggeration+15000)/coords.earthRadiusMeters);
      const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();root.matrix.decompose(p,q,s);
      state.transform=`p ${p.toArray().map(n=>n.toFixed(5)).join(', ')} · q ${q.toArray().map(n=>n.toFixed(5)).join(', ')} · s ${s.x.toFixed(7)}`;
      state.anchors=terrainAnchorErrors(manifest,Number(ctx.borders.userData.earthRadius),ctx.borders.position).map(a=>`${a.id} ${a.meters.toFixed(0)} m`).join(' · ');
      notify();
    }catch(error){if(disposed)return;console.warn('Detailed terrain unavailable',error);loader.unloadTerrainLevel();stream?.dispose();stream=null;root=null;state.loading=false;state.error=true;notify();}
  }
  function applyMix(){
    if(!root)return;root.visible=mix>0;
    // Keep the Earth opaque to avoid seeing its back face through the terrain.
    // Only its runtime colour is softened, then exactly restored on exit.
    for(const [color,original]of earthColors)color.copy(original).multiplyScalar(1-0.2*mix);
    for(const [mat,opacity]of cloudOpacity)mat.opacity=opacity*(1-mix);
    for(const [node,visible]of cloudVisibility)node.visible=visible&&mix<1;
  }
  function enter(){
    oldMin=ctx.controls.minDistance;oldMaxZoom=ctx.controls.maxZoom;oldNear=ctx.camera().near;
    ctx.earth.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.material)return;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){if (/cloud|atmosphere/i.test(node.name)){cloudOpacity.set(mat,mat.opacity);if(!cloudVisibility.has(node))cloudVisibility.set(node,node.visible);}const color=(mat as THREE.MeshStandardMaterial).color;if(color&&!earthColors.has(color))earthColors.set(color,color.clone());}});
    ctx.camera().near=Math.min(oldNear,Number(ctx.borders.userData.earthRadius)*0.0005);ctx.camera().updateProjectionMatrix();
    ctx.controls.minDistance=collisionRadius;ctx.controls.maxZoom=Math.max(oldMaxZoom,24);
    state.viewLevel='REGION_L1';destination=1;notify();
  }
  function back(zoomOut=true){
    suppressed=true;destination=0;
    if(!zoomOut)return;
    ctx.cancelFly();flight?.();const camera=ctx.camera(),center=ctx.controls.target.clone();
    const distance=Math.max(oldMin,camera.position.distanceTo(center)*1.6);
    flight=animateCountryCamera(camera,ctx.controls,{position:camera.position.clone().sub(center).setLength(distance).add(center),center,zoom:Math.min(camera.zoom,1.5)},ctx.reducedMotion()?0:900,()=>{flight=null;});
  }
  function tick(delta:number){
    if(disposed)return;
    const now=performance.now();
    stream?.update(ctx.camera(),(selected==='UA'&&!suppressed&&!state.error)||mix>0,now,mix,delta);
    if(stream&&selected==='UA'&&!suppressed&&!state.error&&state.viewLevel==='GLOBE'&&!stream.ready&&!state.loading){state.loading=true;notify();}
    if(stream&&state.loading&&stream.ready){state.loading=false;notify();}
    if(stream?.failure&&!state.error){state.error=true;state.loading=false;destination=0;notify();}
    if(stream&&now-lastUi>=500){lastUi=now;const stats=stream.stats;const summary=`${stats.loaded}/${stats.cached}/${stats.bytes}`;if(summary!==lastSummary){lastSummary=summary;state.loaded=stats.loaded;state.total=manifest!.tiles.length;state.bytes=stats.bytes;state.failed=stream.failed;notify();}}
    if(selected==='UA'&&!suppressed&&!state.error){
      if(!attempted)void preload();
      if(root&&stream?.ready&&!state.loading&&state.viewLevel==='GLOBE'&&!ctx.flying()&&!flight&&allowed())enter();
    }
    if(mix!==destination){const step=ctx.reducedMotion()?1:delta/0.8;mix=destination>mix?Math.min(destination,mix+step):Math.max(destination,mix-step);applyMix();
      if(mix===0){state.viewLevel='GLOBE';ctx.camera().near=oldNear;ctx.camera().updateProjectionMatrix();ctx.controls.minDistance=oldMin;ctx.controls.maxZoom=oldMaxZoom;notify();}
    }
    if(state.viewLevel==='REGION_L1'&&destination===1){
      const camera=ctx.camera();if(camera instanceof THREE.PerspectiveCamera){worldCenter.copy(ctx.borders.position);ctx.frame.localToWorld(worldCenter);collisionOffset.copy(camera.position).sub(worldCenter);if(collisionOffset.lengthSq()<collisionRadius*collisionRadius)camera.position.copy(worldCenter).add(collisionOffset.setLength(collisionRadius));}
    }
  }
  const zoomGesture=()=>{if(selected==='UA')userZoomed=true;};
  const wheel=(event:Event)=>{if((event as WheelEvent).deltaY<0)zoomGesture();};
  const touch=(event:Event)=>{if((event as TouchEvent).touches.length>1)zoomGesture();};
  ctx.controls.domElement?.addEventListener('wheel',wheel,{passive:true});
  ctx.controls.domElement?.addEventListener('touchmove',touch,{passive:true});
  return {
    tick, userZoom:zoomGesture,
    select(code:string|null,explicit=false){if(code!==selected||explicit){selected=code;suppressed=false;userZoomed=false;if(code!=='UA'){destination=0;notify();}}},
    back,
    setBorders(value:boolean){debugBorders=value;stream?.setBorders(value);},
    audit(){return stream?.audit()??null;},
    stats(){return stream?.stats??{loaded:0,visible:0,cached:0,bytes:0,networkBytes:0,networkRequests:0,cacheHits:0,distance:ctx.camera().position.length(),evaluations:0,states:''};},
    invalidate(){stream?.selector.invalidate();},
    inspectArea(area:'west'|'center'|'south'|'edge'){
      if(!manifest)return;ctx.cancelFly();flight?.();
      const b=manifest.bounds as {minLat:number;maxLat:number;minLon:number;maxLon:number};
      const fractions={west:[0.22,0.7],center:[0.48,0.6],south:[0.48,0.35],edge:[0.97,0.85]}[area];
      const lat=b.minLat+(b.maxLat-b.minLat)*fractions[1],lon=b.minLon+(b.maxLon-b.minLon)*fractions[0];
      const center=ctx.frame.localToWorld(ctx.borders.position.clone()),direction=latLngToVector3(lat,lon,1).transformDirection(ctx.frame.matrixWorld);
      flight=animateCountryCamera(ctx.camera(),ctx.controls,{position:center.clone().addScaledVector(direction,Math.max(collisionRadius,Number(ctx.borders.userData.earthRadius)*1.12)),center,zoom:ctx.camera() instanceof THREE.OrthographicCamera?12:1},900,()=>{flight=null;});
    },
    dispose(){disposed=true;flight?.();ctx.controls.domElement?.removeEventListener('wheel',wheel);ctx.controls.domElement?.removeEventListener('touchmove',touch);loader.unloadTerrainLevel();stream?.dispose();for(const [node,visible]of cloudVisibility)node.visible=visible;for(const [mat,opacity]of cloudOpacity)mat.opacity=opacity;ctx.camera().near=oldNear;ctx.camera().updateProjectionMatrix();for(const [color,original]of earthColors)color.copy(original);ctx.controls.minDistance=oldMin;ctx.controls.maxZoom=oldMaxZoom;earthColors.clear();},
  };
}
