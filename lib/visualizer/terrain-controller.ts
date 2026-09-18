import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneCamera } from './base-scene';
import { TerrainLoader, type LoadedManifest } from './terrain-loader';
import { terrainRootMatrix, terrainAnchorErrors, type TerrainCoordinates } from './terrain-alignment';
import { INITIAL_TERRAIN, terrainAllowed, type TerrainStatus } from './terrain-state';
import { animateCountryCamera } from './country-camera';
import { TerrainStream } from './terrain-stream';
import { AlpsStream } from './alps-stream';
import { latLngToVector3 } from './geography';
import { alpsDepthRange } from './alps-spherical';
import { AlpsBorders } from './alps-borders';

type Context = { prepare:(root:THREE.Group)=>Promise<unknown>; frame:THREE.Group; earth:THREE.Group; borders:THREE.LineSegments; controls:OrbitControls; camera:()=>SceneCamera; ready:()=>boolean; flying:()=>boolean; cancelFly:()=>void; reducedMotion:()=>boolean; notify:(state:TerrainStatus)=>void };
const REGIONS:Record<string,string>={UA:'/terrain/eastern_europe_test/L1/manifest.json',FR:'/terrain/alps/L1/manifest.json',CH:'/terrain/alps/L1/manifest.json',IT:'/terrain/alps/L1/manifest.json'};
export function createTerrainController(ctx:Context) {
  let state={...INITIAL_TERRAIN}, selected:string|null=null, suppressed=false, disposed=false;
  let root:THREE.Group|null=null, manifest:LoadedManifest|null=null, stream:TerrainStream|AlpsStream|null=null;
  const worldCenter=new THREE.Vector3(),collisionOffset=new THREE.Vector3();
  const cloudVisibility=new Map<THREE.Object3D,boolean>();
  let lastUi=0,lastSummary='';
  let mix=0, destination=0, debugBorders=false, attempted:string|null=null, flight:(()=>void)|null=null;
  let oldMin=ctx.controls.minDistance, oldMaxZoom=ctx.controls.maxZoom, oldNear=ctx.camera().near, oldFar=ctx.camera().far;
  let userZoomed=false;
  let alpsPreviewPending=false;
  let crossingUntil=0;
  let crossingAudit={frames:0,globeFrames:0,missingSurfaceFrames:0,minLongitude:Infinity,maxLongitude:-Infinity};
  const cloudOpacity=new Map<THREE.Material,number>();
  let collisionRadius=0;
  let clearanceMeters:number|null=null;
  let drapedBorders:AlpsBorders|null=null;

  const earthColors=new Map<THREE.Color,THREE.Color>();
  let loader=new TerrainLoader(progress=>{state={...state,...progress};notify();});
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
    const code=selected;if(!code||!REGIONS[code])return;
    if(disposed||!ctx.ready()||(!alpsPreviewPending&&!allowed()))return;
    if(attempted&&attempted!==code){
      if(REGIONS[attempted]===REGIONS[code]&&stream){attempted=code;return;}
      drapedBorders?.dispose();drapedBorders=null;
      loader.unloadTerrainLevel();stream?.dispose();stream=null;root=null;manifest=null;
      loader=new TerrainLoader(progress=>{state={...state,...progress};notify();});
    }
    attempted=code;state.loading=true;state.error=false;notify();
    try{
      manifest=await loader.loadTerrainManifest(REGIONS[code]);
      if(disposed)return;
      const mobile=mobileQuery.matches;
      stream=manifest.region==='alps'?new AlpsStream(manifest,Number(ctx.borders.userData.earthRadius),mobile,ctx.prepare,()=>ctx.controls.domElement?.clientHeight??window.innerHeight):new TerrainStream(manifest,Number(ctx.borders.userData.earthRadius),mobile,ctx.prepare);
      root=stream.root;
      root.matrix.copy(terrainRootMatrix(manifest,Number(ctx.borders.userData.earthRadius),ctx.borders.position));root.matrixAutoUpdate=false;
      root.visible=false;ctx.frame.add(root);
      if(stream instanceof AlpsStream)drapedBorders=new AlpsBorders(ctx.frame,ctx.borders,stream,Number(ctx.borders.userData.earthRadius));
      stream.setBorders(debugBorders);
      const coords=manifest.coordinateSystem as TerrainCoordinates;
      const maxHeight=Math.max(...manifest.tiles.map(t=>Number(t.height_max)||0));
      collisionRadius=Number(ctx.borders.userData.earthRadius)*(1+(stream instanceof AlpsStream?0:maxHeight*coords.heightExaggeration+15000)/coords.earthRadiusMeters);
      const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();root.matrix.decompose(p,q,s);
      state.transform=`p ${p.toArray().map(n=>n.toFixed(5)).join(', ')} · q ${q.toArray().map(n=>n.toFixed(5)).join(', ')} · s ${s.x.toFixed(7)}`;
      state.anchors=terrainAnchorErrors(manifest,Number(ctx.borders.userData.earthRadius),ctx.borders.position).map(a=>`${a.id} ${a.meters.toFixed(0)} m`).join(' · ');
      notify();
    }catch(error){if(disposed)return;console.warn('Detailed terrain unavailable',error);drapedBorders?.dispose();drapedBorders=null;loader.unloadTerrainLevel();stream?.dispose();stream=null;root=null;attempted=null;state.loading=false;state.error=true;notify();}
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
    oldMin=ctx.controls.minDistance;oldMaxZoom=ctx.controls.maxZoom;oldNear=ctx.camera().near;oldFar=ctx.camera().far;
    ctx.earth.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.material)return;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){if (/cloud|atmosphere/i.test(node.name)){cloudOpacity.set(mat,mat.opacity);if(!cloudVisibility.has(node))cloudVisibility.set(node,node.visible);}const color=(mat as THREE.MeshStandardMaterial).color;if(color&&!earthColors.has(color))earthColors.set(color,color.clone());}});
    ctx.camera().near=Math.min(oldNear,Number(ctx.borders.userData.earthRadius)*0.0005);ctx.camera().updateProjectionMatrix();
    ctx.controls.minDistance=collisionRadius;ctx.controls.maxZoom=Math.max(oldMaxZoom,24);
    if(stream instanceof AlpsStream){
      const radius=Number(ctx.borders.userData.earthRadius),unit=radius/6371000;
      const camera=ctx.camera(),local=ctx.frame.worldToLocal(camera.position.clone()).sub(ctx.borders.position).normalize();
      const lat=THREE.MathUtils.radToDeg(Math.asin(local.y)),lon=THREE.MathUtils.radToDeg(Math.atan2(local.x,local.z));
      const height=stream.heightAt(lat,lon);
      const direction=height===null?latLngToVector3(45.83278,6.86472,1):local;
      const elevation=height??stream.heightAt(45.83278,6.86472)??4810;
      ctx.controls.target.copy(ctx.frame.localToWorld(ctx.borders.position.clone().addScaledVector(direction,radius+elevation*unit)));
      ctx.controls.minDistance=5*unit;
    }
    state.viewLevel='REGION_L1';destination=1;notify();
  }
  function back(zoomOut=true){
    suppressed=true;destination=0;
    if(stream instanceof AlpsStream)ctx.controls.target.copy(ctx.frame.localToWorld(ctx.borders.position.clone()));
    if(!zoomOut)return;
    ctx.cancelFly();flight?.();const camera=ctx.camera(),center=ctx.controls.target.clone();
    const distance=Math.max(oldMin,camera.position.distanceTo(center)*1.6);
    flight=animateCountryCamera(camera,ctx.controls,{position:camera.position.clone().sub(center).setLength(distance).add(center),center,zoom:Math.min(camera.zoom,1.5)},ctx.reducedMotion()?0:900,()=>{flight=null;});
  }
  function tick(delta:number){
    if(disposed)return;
    const now=performance.now();
    stream?.update(ctx.camera(),(!!selected&&!!REGIONS[selected]&&!suppressed&&!state.error)||mix>0,now,mix,delta);
    if(stream&&!!selected&&!!REGIONS[selected]&&!suppressed&&!state.error&&state.viewLevel==='GLOBE'&&!stream.ready&&!state.loading){state.loading=true;notify();}
    if(stream&&state.loading&&stream.ready){state.loading=false;notify();}
    if(alpsPreviewPending&&stream instanceof AlpsStream&&stream.ready){
      const height=stream.heightAt(45.83278,6.86472);
      if(height!==null){
        alpsPreviewPending=false;userZoomed=true;ctx.cancelFly();flight?.();flight=null;
        const radius=Number(ctx.borders.userData.earthRadius),unit=radius/6371000;
        const direction=latLngToVector3(45.83278,6.86472,1);
        const target=ctx.frame.localToWorld(ctx.borders.position.clone().addScaledVector(direction,radius+height*unit));
        ctx.camera().position.copy(ctx.frame.localToWorld(ctx.borders.position.clone().addScaledVector(direction,radius+(height+20000)*unit)));
        ctx.controls.target.copy(target);ctx.controls.minDistance=5*unit;
        ctx.camera().lookAt(target);ctx.controls.update();
      }
    }
    if(stream?.failure&&!state.error){state.error=true;state.loading=false;destination=0;notify();}
    if(stream&&now-lastUi>=500){lastUi=now;const stats=stream.stats;const summary=`${stats.loaded}/${stats.cached}/${stats.bytes}`;if(summary!==lastSummary){lastSummary=summary;state.loaded=stats.loaded;state.total=stream instanceof AlpsStream?manifest!.tiles.length*3:manifest!.tiles.length;state.bytes=stats.bytes;state.failed=stream.failed;notify();}}
    if(!!selected&&!!REGIONS[selected]&&!suppressed&&!state.error){
      if(attempted!==selected)void preload();
      if(root&&stream?.ready&&!state.loading&&state.viewLevel==='GLOBE'&&!ctx.flying()&&!flight&&allowed())enter();
    }
    if(mix!==destination){const step=ctx.reducedMotion()?1:delta/0.8;mix=destination>mix?Math.min(destination,mix+step):Math.max(destination,mix-step);applyMix();
      if(mix===0){state.viewLevel='GLOBE';ctx.camera().near=oldNear;ctx.camera().far=oldFar;ctx.camera().updateProjectionMatrix();ctx.controls.minDistance=oldMin;ctx.controls.maxZoom=oldMaxZoom;notify();}
    }
    if(state.viewLevel==='REGION_L1'&&destination===1){
      const camera=ctx.camera();if(camera instanceof THREE.PerspectiveCamera){worldCenter.copy(ctx.borders.position);ctx.frame.localToWorld(worldCenter);collisionOffset.copy(camera.position).sub(worldCenter);
        let limit=collisionRadius;
        if(stream instanceof AlpsStream){
          const local=ctx.frame.worldToLocal(camera.position.clone()).sub(ctx.borders.position).normalize();
          const lat=THREE.MathUtils.radToDeg(Math.asin(local.y)),lon=THREE.MathUtils.radToDeg(Math.atan2(local.x,local.z));
          const height=stream.collisionHeightAt(lat,lon)??0;
          limit=Number(ctx.borders.userData.earthRadius)*(1+(height+10)/6371000);
          clearanceMeters=Math.max(collisionOffset.length(),limit)/Number(ctx.borders.userData.earthRadius)*6371000-6371000-height;
        }
        if(collisionOffset.lengthSq()<limit*limit)camera.position.copy(worldCenter).add(collisionOffset.setLength(limit));}
    }
    if(stream instanceof AlpsStream&&mix>0){
      const camera=ctx.camera(),center=ctx.frame.localToWorld(ctx.borders.position.clone());
      const range=alpsDepthRange(Number(ctx.borders.userData.earthRadius),camera.position.distanceTo(center),oldNear);
      camera.near=range.near;camera.far=range.far;camera.updateProjectionMatrix();
    }
    drapedBorders?.update(mix>0,ctx.camera().position.distanceTo(ctx.frame.localToWorld(ctx.borders.position.clone()))<Number(ctx.borders.userData.earthRadius)*1.03);
    if(now<crossingUntil&&stream instanceof AlpsStream){
      const local=ctx.frame.worldToLocal(ctx.controls.target.clone()).sub(ctx.borders.position).normalize();
      const lat=THREE.MathUtils.radToDeg(Math.asin(local.y)),lon=THREE.MathUtils.radToDeg(Math.atan2(local.x,local.z));
      crossingAudit.frames++;crossingAudit.globeFrames+=Number(state.viewLevel!=='REGION_L1');
      crossingAudit.missingSurfaceFrames+=Number(!stream.visibleSurfaceAt(lat,lon));
      crossingAudit.minLongitude=Math.min(crossingAudit.minLongitude,lon);crossingAudit.maxLongitude=Math.max(crossingAudit.maxLongitude,lon);
    }
  }
  const zoomGesture=()=>{if(selected&&REGIONS[selected])userZoomed=true;};
  const wheel=(event:Event)=>{if((event as WheelEvent).deltaY<0)zoomGesture();};
  const touch=(event:Event)=>{if((event as TouchEvent).touches.length>1)zoomGesture();};
  ctx.controls.domElement?.addEventListener('wheel',wheel,{passive:true});
  ctx.controls.domElement?.addEventListener('touchmove',touch,{passive:true});
  return {
    tick, userZoom:zoomGesture,
    capitalElevation(lat:number,lon:number){return mix>0 && stream instanceof AlpsStream && stream.visibleSurfaceAt(lat,lon) ? stream.renderHeightAt(lat,lon) : null;},
    capitalOccluder(){return mix>0 && root?.visible ? root : null;},
    requestAlpsPreview(){if(process.env.NODE_ENV==='development'&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname))alpsPreviewPending=true;},
    select(code:string|null,explicit=false){if(code!==selected||explicit){if(stream instanceof AlpsStream&&code!==selected){ctx.controls.target.copy(ctx.frame.localToWorld(ctx.borders.position.clone()));destination=0;}selected=code;suppressed=false;userZoomed=false;if(!code||!REGIONS[code]){destination=0;notify();}}},
    back,
    setBorders(value:boolean){debugBorders=value;stream?.setBorders(value);},
    audit(){return {terrain:stream?.audit()??null,borders:drapedBorders?.audit()??null,near:ctx.camera().near,far:ctx.camera().far,crossing:crossingAudit};},
    stats(){const stats=stream?.stats??{loaded:0,visible:0,cached:0,bytes:0,networkBytes:0,networkRequests:0,cacheHits:0,distance:ctx.camera().position.length(),evaluations:0,states:''};return {...stats,states:stats.states+(clearanceMeters===null?'':` | clearance ${clearanceMeters.toFixed(2)} m`)+(stream instanceof AlpsStream?'\n'+stream.coverageDebug:'')};},
    invalidate(){stream?.selector.invalidate();},
    inspectAlps(lat:number,lon:number,clearance:number,oblique=false){
      if(!(stream instanceof AlpsStream)||process.env.NODE_ENV!=='development')return;
      const height=stream.heightAt(lat,lon);if(height===null)return;
      ctx.cancelFly();flight?.();
      const radius=Number(ctx.borders.userData.earthRadius),unit=radius/6371000;
      const target=ctx.frame.localToWorld(ctx.borders.position.clone().add(latLngToVector3(lat,lon,radius+height*unit)));
      const position=ctx.frame.localToWorld(ctx.borders.position.clone().add(latLngToVector3(lat-(oblique?0.015:0),lon,radius+(height+clearance)*unit)));
      suppressed=false;destination=1;userZoomed=true;
      crossingAudit={frames:0,globeFrames:0,missingSurfaceFrames:0,minLongitude:Infinity,maxLongitude:-Infinity};crossingUntil=performance.now()+2500;
      flight=animateCountryCamera(ctx.camera(),ctx.controls,{position,center:target,zoom:1},1800,()=>{flight=null;});
    },
    inspectMontBlanc(clearance:number){
      if(!(stream instanceof AlpsStream))return;
      ctx.cancelFly();flight?.();
      const lat=45.83278,lon=6.86472,radius=Number(ctx.borders.userData.earthRadius),unit=radius/6371000;
      const height=stream.heightAt(lat,lon);if(height===null)return;
      const direction=latLngToVector3(lat,lon,1),target=ctx.frame.localToWorld(ctx.borders.position.clone().addScaledVector(direction,radius+height*unit));
      const position=ctx.frame.localToWorld(ctx.borders.position.clone().addScaledVector(direction,radius+(height+clearance)*unit));
      suppressed=false;destination=1;
      flight=animateCountryCamera(ctx.camera(),ctx.controls,{position,center:target,zoom:1},ctx.reducedMotion()?0:900,()=>{flight=null;});
    },
    inspectArea(area:'west'|'center'|'south'|'edge'){
      if(!manifest)return;ctx.cancelFly();flight?.();
      const b=manifest.bounds as {minLat:number;maxLat:number;minLon:number;maxLon:number};
      const fractions={west:[0.22,0.7],center:[0.48,0.6],south:[0.48,0.35],edge:[0.97,0.85]}[area];
      const lat=b.minLat+(b.maxLat-b.minLat)*fractions[1],lon=b.minLon+(b.maxLon-b.minLon)*fractions[0];
      const center=ctx.frame.localToWorld(ctx.borders.position.clone()),direction=latLngToVector3(lat,lon,1).transformDirection(ctx.frame.matrixWorld);
      flight=animateCountryCamera(ctx.camera(),ctx.controls,{position:center.clone().addScaledVector(direction,Math.max(collisionRadius,Number(ctx.borders.userData.earthRadius)*1.12)),center,zoom:ctx.camera() instanceof THREE.OrthographicCamera?12:1},900,()=>{flight=null;});
    },
    dispose(){disposed=true;flight?.();drapedBorders?.dispose();ctx.controls.domElement?.removeEventListener('wheel',wheel);ctx.controls.domElement?.removeEventListener('touchmove',touch);loader.unloadTerrainLevel();stream?.dispose();for(const [node,visible]of cloudVisibility)node.visible=visible;for(const [mat,opacity]of cloudOpacity)mat.opacity=opacity;ctx.camera().near=oldNear;ctx.camera().far=oldFar;ctx.camera().updateProjectionMatrix();for(const [color,original]of earthColors)color.copy(original);ctx.controls.minDistance=oldMin;ctx.controls.maxZoom=oldMaxZoom;earthColors.clear();},
  };
}
