import * as THREE from 'three';
import type { TerrainTile } from '../terrain/contract';
import { fetchTerrainTileBytes,decodeTerrainTile,disposeTerrainObject,type LoadedManifest } from './terrain-loader';
import { TERRAIN_PERFORMANCE as CONFIG,type TileState } from './terrain-config';
import { TerrainSelector,terrainTileBounds } from './terrain-selection';
import { applyTerrainProjection } from './terrain-projection';
import { createTileBorders } from './terrain-alignment';

export class TerrainByteCache {
 private data=new Map<string,{bytes:ArrayBuffer;used:number}>();private pending=new Map<string,Promise<ArrayBuffer>>();
 downloaded=0;requests=0;hits=0;
 constructor(private policy:{byteBudget:number;byteRetentionMs:number}){}
 async get(tile:TerrainTile,manifest:LoadedManifest,signal:AbortSignal){
  const key=new URL(tile.file,manifest.sourceUrl).href+'#'+tile.sha256,cached=this.data.get(key);
  if(cached){cached.used=performance.now();this.hits++;return cached.bytes;}
  if(this.pending.has(key))return this.pending.get(key)!;
  const promise=fetchTerrainTileBytes(tile,manifest,signal).then(bytes=>{this.downloaded+=bytes.byteLength;this.requests++;this.data.set(key,{bytes,used:performance.now()});this.prune(performance.now());return bytes;}).finally(()=>this.pending.delete(key));
  this.pending.set(key,promise);return promise;
 }
 prune(now:number){let size=this.bytes;for(const[key,value]of [...this.data].sort((a,b)=>a[1].used-b[1].used)){if(now-value.used>this.policy.byteRetentionMs||size>this.policy.byteBudget){this.data.delete(key);size-=value.bytes.byteLength;}}}
 get bytes(){let total=0;for(const item of this.data.values())total+=item.bytes.byteLength;return total;}
 clear(){this.data.clear();}
}
type MaterialState={material:THREE.Material;opacity:number;transparent:boolean;depthWrite:boolean};
export type TerrainEntry={tile:TerrainTile;state:TileState;object:THREE.Group|null;line:THREE.LineSegments|null;pending:Promise<void>|null;wanted:boolean;needed:boolean;lastNeeded:number;fade:number;lastOpacity:number;materials:MaterialState[]};
export class TerrainStream {
 readonly root=new THREE.Group();readonly entries:TerrainEntry[];readonly cache:TerrainByteCache;readonly selector:TerrainSelector;
 private abort=new AbortController();private inFlight=0;private disposed=false;private lastEviction=0;private debug=false;private active=false;private initialized=false;private queueDirty=true;private veryFar=false;failure=false;
 private policy;distance=0;altitude=0;
 constructor(readonly manifest:LoadedManifest,radius:number,private mobile:boolean,private prepare:(root:THREE.Group)=>Promise<unknown>){
  this.policy=mobile?CONFIG.mobile:CONFIG.desktop;this.cache=new TerrainByteCache(this.policy);this.root.name='TerrainRoot';
  this.entries=manifest.tiles.map(tile=>({tile,state:'UNLOADED',object:null,line:null,pending:null,wanted:false,needed:false,lastNeeded:0,fade:0,lastOpacity:-1,materials:[]}));
  this.selector=new TerrainSelector(manifest.tiles.map(tile=>({tile,localBox:terrainTileBounds(manifest,tile),worldBox:new THREE.Box3(),sphere:new THREE.Sphere(),score:0})),radius,mobile);
 }
 update(camera:THREE.Camera,active:boolean,now:number,mix:number,delta:number){
  if(this.disposed)return;this.active=active;
  const selection=this.selector.select(camera,this.root,active,now);
  if(selection){this.queueDirty=true;this.initialized=true;this.distance=selection.distance;this.altitude=selection.altitude;this.veryFar=selection.veryFar;for(const e of this.entries){e.wanted=selection.visible.has(e.tile.tile_id);e.needed=selection.preload.has(e.tile.tile_id);if(e.needed)e.lastNeeded=now;}}
  for(const e of this.entries){if(e.needed)e.lastNeeded=now;if(!e.object||e.state==='LOADING')continue;
   const destination=e.wanted&&active?1:0,step=delta/CONFIG.tileFadeSeconds;
   const fade=destination>e.fade?Math.min(1,e.fade+step):Math.max(0,e.fade-step);e.fade=fade;
   const opacity=fade*mix;e.object.visible=opacity>0;
   e.state=e.object.visible?'VISIBLE':'HIDDEN';if(e.line)e.line.visible=this.debug&&e.object.visible;
   if(opacity===e.lastOpacity)continue;e.lastOpacity=opacity;
   for(const original of e.materials){const m=original.material;m.opacity=original.opacity*opacity;const complete=opacity===1;const transparent=!complete||original.transparent||!!m.userData.terrainFeather;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.depthWrite=complete?original.depthWrite:false;}
  }
  if(this.queueDirty){this.queueDirty=false;this.pump();}
  if(now-this.lastEviction>=CONFIG.evictionIntervalMs){this.lastEviction=now;this.cache.prune(now);for(const e of this.entries)if(e.object&&!e.pending&&!e.needed&&e.fade===0&&now-e.lastNeeded>=this.policy.gpuRetentionMs*(this.veryFar?CONFIG.distantRetentionFactor:1))this.release(e);}
 }
 private pump(){
  if(!this.active||this.disposed)return;
  const queue=this.entries.filter(e=>e.needed&&!e.pending&&!e.object&&e.state!=='FAILED').sort((a,b)=>Number(b.wanted)-Number(a.wanted)||this.selector.volumes.find(v=>v.tile===a.tile)!.score-this.selector.volumes.find(v=>v.tile===b.tile)!.score);
  for(const e of queue){if(this.inFlight>=this.policy.concurrent)break;this.inFlight++;e.state='LOADING';
   e.pending=(async()=>{const bytes=await this.cache.get(e.tile,this.manifest,this.abort.signal);const object=await decodeTerrainTile(bytes,e.tile,this.manifest,this.abort.signal);if(this.disposed){disposeTerrainObject(object);return;}
    e.object=object;object.visible=false;this.root.add(object);
    const single={...this.manifest,tiles:[e.tile]};const wrapper=new THREE.Group();wrapper.add(object);
    e.line=createTileBorders(wrapper,single);object.add(e.line);applyTerrainProjection(wrapper,single);this.root.add(object);
    object.traverse(node=>{if(node===e.line)return;const m=(node as THREE.Mesh).material;if(m)for(const material of Array.isArray(m)?m:[m]){e.materials.push({material,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});material.opacity=0;material.transparent=true;material.depthWrite=false;}});
    await this.prepare(object);if(this.disposed)return;e.state='READY';
   })().catch(error=>{if(!this.disposed){console.warn('Terrain tile unavailable',e.tile.tile_id,error);this.release(e);e.state='FAILED';this.failure=true;}}).finally(()=>{e.pending=null;this.inFlight--;this.queueDirty=true;});
  }
 }
 get ready(){if(!this.initialized)return false;let count=0;for(const e of this.entries)if(e.wanted){count++;if(!e.object||e.state==='LOADING'||e.state==='FAILED')return false;}return count>0;}
 get failed(){return this.entries.filter(e=>e.state==='FAILED').map(e=>e.tile.tile_id);}
 get stats(){return{loaded:this.entries.filter(e=>e.object&&e.state!=='LOADING').length,visible:this.entries.filter(e=>e.object?.visible).length,cached:this.entries.filter(e=>e.object&&!e.object.visible&&e.state!=='LOADING').length,bytes:this.cache.downloaded,networkBytes:this.cache.bytes,networkRequests:this.cache.requests,cacheHits:this.cache.hits,distance:this.distance,evaluations:this.selector.evaluations,states:this.entries.map(e=>`${e.tile.x}_${e.tile.y}:${e.state}`).join(' ')};}
 audit(){
  const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  for(const entry of this.entries)for(const {material}of entry.materials){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}
  return {materials:materials.size,transparent:[...materials].filter(m=>m.transparent).length,textureInstances:textures.size,textures:[...textures].map(t=>({name:t.name,width:(t.image as {width?:number}|undefined)?.width,height:(t.image as {height?:number}|undefined)?.height,colorSpace:t.colorSpace,mipmaps:t.generateMipmaps,anisotropy:t.anisotropy,minFilter:t.minFilter}))};
 }
 setBorders(value:boolean){this.debug=value;}
 private release(e:TerrainEntry){if(e.object)disposeTerrainObject(e.object);e.object=null;e.line=null;e.materials=[];e.fade=0;e.lastOpacity=-1;e.state='UNLOADED';}
 dispose(){this.disposed=true;this.abort.abort();for(const e of this.entries)this.release(e);this.cache.clear();this.root.removeFromParent();}
}
