import * as THREE from 'three';
import type { TerrainTile } from '../terrain/contract';
import { loadTerrainManifest, decodeTerrainTile, disposeTerrainObject, type LoadedManifest } from './terrain-loader';
import { TerrainByteCache } from './terrain-stream';
import { applyTerrainProjection } from './terrain-projection';
import { createTileBorders } from './terrain-alignment';
import { alpsPointFactory, rebuildAlpsGeometry, alpsDemSampler, type AlpsBounds } from './alps-spherical';

export const ALPS_MAX_SSE = 3;
export function screenSpaceError(errorMeters:number,distanceMeters:number,verticalFov:number,viewportHeight:number) {
  return errorMeters*viewportHeight/(2*Math.tan(verticalFov/2)*Math.max(distanceMeters,1));
}
export function selectAlpsLod(errors:number[],distance:number,fov:number,height:number,previous:number) {
  let lod=previous;
  while(lod<2&&screenSpaceError(errors[lod],distance,fov,height)>ALPS_MAX_SSE)lod++;
  while(lod>0&&screenSpaceError(errors[lod-1],distance,fov,height)<ALPS_MAX_SSE/1.35)lod--;
  return lod;
}
type Entry={tile:TerrainTile;manifest:LoadedManifest;object:THREE.Group|null;line:THREE.LineSegments|null;loading:boolean;failed:boolean;last:number;geometryBytes:number;textureBytes:number;morph:{value:number};morphFrom?:TerrainTile};
export class AlpsStream {
  readonly root=new THREE.Group();
  readonly selector={invalidate:()=>{this.lastSelection=-Infinity;}};
  private abort=new AbortController();
  private entries:Entry[]=[];
  private native:Float32Array|null=null;
  private sampleDem:((lat:number,lon:number)=>number|null)|null=null;
  private get cellCount(){return this.manifest.tiles.length;}
  private desired=new Map<number,number>();
  private displayed=new Map<number,Entry>();
  private boxes:THREE.Box3[]=[];
  private lastSelection=-Infinity;
  private disposed=false;
  private debug=false;
  private flight=0;
  private evaluations=0;
  private distance=0;
  private altitude=0;
  private sse=0;
  failure=false;
  private initialized=false;
  private readonly networkBudget=64*1024*1024;
  private cache=new TerrainByteCache({byteBudget:this.networkBudget,byteRetentionMs:120000});
  private readonly maxConcurrent:number;
  private readonly geometryBudget:number;
  private readonly textureBudget:number;
  private cellDistance=new Map<number,number>();
  private prefetchCells=new Set<number>();
  private prevLocalCamera:THREE.Vector3|null=null;
  constructor(readonly manifest:LoadedManifest,private radius:number,private mobile:boolean,private prepare:(root:THREE.Group)=>Promise<unknown>,private viewportHeight:()=>number){
    this.root.name='AlpsMultiLod';
    this.maxConcurrent=mobile?1:2;
    this.geometryBudget=(mobile?32:64)*1024*1024;
    this.textureBudget=(mobile?16:32)*1024*1024;
    void this.initialize();
  }
  private async initialize(){
    try{
      const [l0,l2,response]=await Promise.all([loadTerrainManifest('/terrain/alps/L0/manifest.json',this.abort.signal),loadTerrainManifest('/terrain/alps/L2/manifest.json',this.abort.signal),fetch('/terrain/alps/L2/heights.bin',{signal:this.abort.signal})]);
      if(!response.ok)throw new Error('Local DEM unavailable');
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==(this.manifest.grid.countX*252+1)*(this.manifest.grid.countY*180+1)*4)throw new Error('Invalid native DEM dimensions');
      if(this.disposed)return;
      this.native=new Float32Array(bytes);
      this.sampleDem=alpsDemSampler(l2,this.native);
      for(const m of [l0,this.manifest,l2]){
        if(m.grid.countX!==this.manifest.grid.countX||m.grid.countY!==this.manifest.grid.countY||JSON.stringify(m.bounds)!==JSON.stringify(this.manifest.bounds))throw new Error('Alps LOD grid mismatch');
        for(const tile of [...m.tiles].sort((a,b)=>a.y-b.y||a.x-b.x))this.entries.push({tile,manifest:m,object:null,line:null,loading:false,failed:false,last:0,geometryBytes:0,textureBytes:0,morph:{value:1}});
      }
      const point=alpsPointFactory(l2,this.radius);
      this.boxes=[...l2.tiles].sort((a,b)=>a.y-b.y||a.x-b.x).map(t=>{
        const box=new THREE.Box3();
        for(let y=0;y<=4;y++)for(let x=0;x<=4;x++)for(const h of [Number(t.height_min)-Number(t.skirt_depth_m),Number(t.height_max)])
          box.expandByPoint(point(t.min_lat+y/4*(t.max_lat-t.min_lat),t.min_lon+x/4*(t.max_lon-t.min_lon),h));
        return box.expandByScalar(20/100000);
      });
      this.initialized=true;
    }catch(error){if(!this.disposed){this.failure=true;console.error('Alps initialization',error);}}
  }
  heightAt(lat:number,lon:number){
    return this.sampleDem?.(lat,lon)??null;
  }
  collisionHeightAt(lat:number,lon:number){
    const native=this.heightAt(lat,lon);if(native===null)return null;
    let surface=native;
    for(const e of this.entries){const t=e.tile;if(!e.object?.visible||lon<t.min_lon||lon>t.max_lon||lat<t.min_lat||lat>t.max_lat)continue;
      if(e.morph.value<1&&e.morphFrom)surface=Math.max(surface,this.gridHeight(e.morphFrom,lat,lon));
      const [nx,ny]=t.vertex_resolution as number[],x=(lon-t.min_lon)/(t.max_lon-t.min_lon)*(nx-1),y=(lat-t.min_lat)/(t.max_lat-t.min_lat)*(ny-1),i=Math.min(nx-2,Math.floor(x)),j=Math.min(ny-2,Math.floor(y)),u=x-i,v=y-j;
      const h=(a:number,b:number)=>this.heightAt(t.min_lat+b/(ny-1)*(t.max_lat-t.min_lat),t.min_lon+a/(nx-1)*(t.max_lon-t.min_lon))??native;
      surface=Math.max(surface,u+v<=1?h(i,j)*(1-u-v)+h(i+1,j)*u+h(i,j+1)*v:h(i+1,j+1)*(u+v-1)+h(i+1,j)*(1-v)+h(i,j+1)*(1-u));
    }
    return surface;
  }
  renderHeightAt(lat:number,lon:number){
    for(const e of this.displayed.values()){
      const t=e.tile;if(!e.object?.visible||lon<t.min_lon||lon>t.max_lon||lat<t.min_lat||lat>t.max_lat)continue;
      const height=this.gridHeight(t,lat,lon);
      return e.morphFrom&&e.morph.value<1?THREE.MathUtils.lerp(this.gridHeight(e.morphFrom,lat,lon),height,e.morph.value):height;
    }
    return this.heightAt(lat,lon);
  }
  visibleSurfaceAt(lat:number,lon:number){return [...this.displayed.values()].some(e=>e.object?.visible&&lon>=e.tile.min_lon&&lon<=e.tile.max_lon&&lat>=e.tile.min_lat&&lat<=e.tile.max_lat);}
  get surfaceRevision(){return [...this.displayed.values()].filter(e=>e.object?.visible).map(e=>`${e.tile.tile_id}:${e.morph.value}`).join('|');}
  private gridHeight(t:TerrainTile,lat:number,lon:number){
    const [nx,ny]=t.vertex_resolution as number[],x=(lon-t.min_lon)/(t.max_lon-t.min_lon)*(nx-1),y=(lat-t.min_lat)/(t.max_lat-t.min_lat)*(ny-1),i=Math.max(0,Math.min(nx-2,Math.floor(x))),j=Math.max(0,Math.min(ny-2,Math.floor(y))),u=x-i,v=y-j;
    const bounds=this.manifest.bounds as AlpsBounds;
    const h=(a:number,b:number)=>this.heightAt(THREE.MathUtils.clamp(t.min_lat+b/(ny-1)*(t.max_lat-t.min_lat),bounds.minLat,bounds.maxLat),THREE.MathUtils.clamp(t.min_lon+a/(nx-1)*(t.max_lon-t.min_lon),bounds.minLon,bounds.maxLon))??0;
    return u+v<=1?h(i,j)*(1-u-v)+h(i+1,j)*u+h(i,j+1)*v:h(i+1,j+1)*(u+v-1)+h(i+1,j)*(1-v)+h(i,j+1)*(1-u);
  }
  private beginMorph(e:Entry,previous:Entry){
    if(previous.tile.lod>=e.tile.lod)return;
    const [nx,ny]=e.tile.vertex_resolution as number[];
    const point=alpsPointFactory(e.manifest,this.radius);
    e.object?.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh||!mesh.geometry)return;
      const position=mesh.geometry.getAttribute('position'),coarse=mesh.geometry.getAttribute('alpsCoarsePosition') as THREE.BufferAttribute;
      if(!coarse||position.count<nx*ny)return;
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const lat=e.tile.min_lat+j/(ny-1)*(e.tile.max_lat-e.tile.min_lat),lon=e.tile.min_lon+i/(nx-1)*(e.tile.max_lon-e.tile.min_lon);
        const p=point(lat,lon,this.gridHeight(previous.tile,lat,lon));
        coarse.setXYZ(j*nx+i,p.x,p.y,p.z);
      }
      // Skirts remain at their final bottom edge throughout the surface morph.
      coarse.needsUpdate=true;
    });
    e.morphFrom=previous.tile;e.morph.value=0;
  }
  update(camera:THREE.Camera,active:boolean,now:number,mix:number,_delta:number){
    if(!this.initialized||this.disposed)return;
    this.root.updateWorldMatrix(true,true);camera.updateMatrixWorld();
    if(now-this.lastSelection>=120){
      this.lastSelection=now;this.evaluations++;
      const center=this.root.parent?.getWorldPosition(new THREE.Vector3())??new THREE.Vector3();
      this.distance=camera.position.distanceTo(center);this.altitude=(this.distance/this.radius-1)*6371000;
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(this.root.matrixWorld));
      const localCamera=this.root.worldToLocal(camera.position.clone());
      const metersPerUnit=this.root.matrixWorld.getMaxScaleOnAxis()/this.radius*6371000;
      const next=new Map<number,number>();this.sse=0;
      const nextDistance=new Map<number,number>();
      for(let cell=0;cell<this.cellCount;cell++){
        const box=this.boxes[cell];
        if(!active||!frustum.intersectsBox(box)||this.altitude>6371000*2)continue;
        const distance=box.distanceToPoint(localCamera)*metersPerUnit;
        nextDistance.set(cell,distance);
        const errors=[0,1,2].map(l=>Number(this.entries[l*this.cellCount+cell].tile.geometric_error_m));
        const fov=camera instanceof THREE.PerspectiveCamera?THREE.MathUtils.degToRad(camera.getEffectiveFOV()):Math.PI/3;
        const h=this.viewportHeight();
        const lod=camera instanceof THREE.OrthographicCamera?2:selectAlpsLod(errors,distance,fov,h,this.desired.get(cell)??0);
        next.set(cell,lod);this.sse=Math.max(this.sse,screenSpaceError(errors[lod],distance,fov,h));
      }
      this.desired=next;
      this.cellDistance=nextDistance;
      // Prefetch: a small one-cell ring ahead of camera travel, just beyond the visible frustum.
      const movement=this.prevLocalCamera?localCamera.clone().sub(this.prevLocalCamera):null;
      this.prevLocalCamera=localCamera.clone();
      const prefetch=new Set<number>();
      if(movement&&movement.lengthSq()>1e-10&&active){
        const dir=movement.normalize();
        const {countX,countY}=this.manifest.grid;
        for(const cell of next.keys()){
          const x=cell%countX,y=Math.floor(cell/countX);
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nx=x+dx,ny=y+dy;
            if(nx<0||ny<0||nx>=countX||ny>=countY)continue;
            const ncell=ny*countX+nx;
            if(next.has(ncell)||prefetch.has(ncell))continue;
            const center=this.boxes[ncell].getCenter(new THREE.Vector3());
            const toNeighbor=center.clone().sub(localCamera).normalize();
            if(toNeighbor.dot(dir)>0.3){prefetch.add(ncell);this.cellDistance.set(ncell,center.distanceTo(localCamera)*metersPerUnit);}
          }
        }
      }
      this.prefetchCells=prefetch;
    }
    // Keep one complete surface per cell until the replacement has decoded.
    for(const e of this.entries)if(e.object)e.object.visible=false;
    const queue:Entry[]=[];
    for(const [cell,lod] of this.desired){
      const desired=this.entries[lod*this.cellCount+cell];desired.last=now;
      let shown=desired.object&&!desired.loading?desired:null;
      if(!shown)for(let l=2;l>=0;l--){const e=this.entries[l*this.cellCount+cell];if(e.object&&!e.loading){shown=e;break;}}
      if(shown?.object){const previous=this.displayed.get(cell);if(previous&&previous!==shown)this.beginMorph(shown,previous);this.displayed.set(cell,shown);shown.morph.value=Math.min(1,shown.morph.value+_delta/0.25);shown.last=now;shown.object.visible=active&&mix>0;if(shown.line)shown.line.visible=this.debug;}
      if(!shown){const base=this.entries[cell];base.last=now;if(!base.object&&!base.loading&&!base.failed)queue.push(base);}
      if(!desired.object&&!desired.loading&&!desired.failed)queue.push(desired);
    }
    const cellOf=(e:Entry)=>e.tile.y*this.manifest.grid.countX+e.tile.x;
    const byDistance=(a:Entry,b:Entry)=>(this.cellDistance.get(cellOf(a))??Infinity)-(this.cellDistance.get(cellOf(b))??Infinity);
    // Nearest-first priority: the visible/desired queue always drains before any prefetch request.
    for(const e of [...new Set(queue)].sort(byDistance)){if(this.flight>=this.maxConcurrent)break;void this.load(e);}
    if(this.flight<this.maxConcurrent){
      const prefetchQueue=[...this.prefetchCells].map(cell=>this.entries[cell]).filter(e=>e&&!e.object&&!e.loading&&!e.failed).sort(byDistance);
      for(const e of prefetchQueue){if(this.flight>=this.maxConcurrent)break;void this.load(e);}
    }
    let usedGeometry=this.entries.reduce((n,e)=>n+e.geometryBytes,0);
    let usedTexture=this.entries.reduce((n,e)=>n+e.textureBytes,0);
    for(const e of [...this.entries].sort((a,b)=>a.last-b.last))if(e.object&&!e.loading&&!e.object.visible&&(now-e.last>15000||usedGeometry>this.geometryBudget||usedTexture>this.textureBudget)){
      usedGeometry-=e.geometryBytes;usedTexture-=e.textureBytes;disposeTerrainObject(e.object);e.object=null;e.line=null;e.geometryBytes=0;e.textureBytes=0;
    }
    this.cache.prune(now);
  }
  private async load(e:Entry){
    e.loading=true;this.flight++;
    try{
      const data=await this.cache.get(e.tile,e.manifest,this.abort.signal);
      const object=await decodeTerrainTile(data,e.tile,e.manifest,this.abort.signal);
      if(this.disposed){disposeTerrainObject(object);return;}
      e.object=object;object.visible=false;
      rebuildAlpsGeometry(object,e.tile,alpsPointFactory(e.manifest,this.radius),(lat,lon)=>this.heightAt(lat,lon),this.manifest.bounds as AlpsBounds);
      object.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;
        mesh.geometry.boundingBox!.union(this.boxes[e.tile.y*this.manifest.grid.countX+e.tile.x]);
        mesh.geometry.boundingBox!.getBoundingSphere(mesh.geometry.boundingSphere!);
      });
      const wrapper=new THREE.Group();wrapper.add(object);
      e.line=createTileBorders(wrapper,{...e.manifest,tiles:[e.tile]},8/100000);object.add(e.line);
      e.line.geometry.userData.terrainProjected=true;
      applyTerrainProjection(wrapper,{...e.manifest,tiles:[e.tile]});this.root.add(object);
      object.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;
        mesh.geometry.setAttribute('alpsCoarsePosition',mesh.geometry.getAttribute('position').clone());
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
          // The existing edge-alpha shader only blends when the material is transparent.
          material.transparent=Boolean(material.userData.terrainFeather);
          const previous=material.onBeforeCompile;
          material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);shader.uniforms.alpsMorph=e.morph;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 alpsCoarsePosition;uniform float alpsMorph;').replace('#include <begin_vertex>','vec3 transformed=mix(alpsCoarsePosition,position,alpsMorph);');};
          material.customProgramCacheKey=()=> 'alps-morph-v1';material.needsUpdate=true;
        }
      });
      await this.prepare(object);
      object.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.geometry)for(const attribute of Object.values(mesh.geometry.attributes))e.geometryBytes+=attribute.array.byteLength;
        if(mesh.geometry?.index)e.geometryBytes+=mesh.geometry.index.array.byteLength;});
      const tex=e.tile.texture_resolution as {color:number[]};e.textureBytes+=tex.color[0]*tex.color[1]*4*4/3;
    }catch(error){if(!this.disposed){e.failed=true;console.error('Alps tile',e.tile.tile_id,error);if(e.object)disposeTerrainObject(e.object);e.object=null;}}
    finally{e.loading=false;this.flight--;}
  }
  get ready(){return this.initialized&&this.desired.size>0&&[...this.desired.keys()].every(cell=>[0,1,2].some(l=>{const e=this.entries[l*this.cellCount+cell];return e.object&&!e.loading;}));}
  get failed(){return this.entries.filter(e=>e.failed).map(e=>e.tile.tile_id);}
  get stats(){
    const visible=this.entries.filter(e=>e.object?.visible),distribution=[0,1,2].map(l=>visible.filter(e=>e.tile.lod===l).length);
    const geometryBytes=this.entries.reduce((s,e)=>s+e.geometryBytes,0),textureBytes=this.entries.reduce((s,e)=>s+e.textureBytes,0);
    const mib=(n:number)=>(n/1048576).toFixed(1);
    return {loaded:this.entries.filter(e=>e.object&&!e.loading).length,visible:visible.length,cached:this.entries.filter(e=>e.object&&!e.object.visible).length,bytes:this.cache.downloaded,networkBytes:this.cache.bytes,networkRequests:this.cache.requests,cacheHits:this.cache.hits,distance:this.distance,evaluations:this.evaluations,states:`L0/L1/L2 ${distribution.join('/')} | loading ${this.flight}/${this.maxConcurrent} | prefetch ${this.prefetchCells.size} | terrain triangles ${visible.reduce((s,e)=>s+Number(e.tile.triangles),0)} | geometry ${mib(geometryBytes)}/${mib(this.geometryBudget)} MiB | texture ${mib(textureBytes)}/${mib(this.textureBudget)} MiB | network ${mib(this.cache.bytes)}/${mib(this.networkBudget)} MiB | altitude ${this.altitude.toFixed(1)} m | SSE ${this.sse.toFixed(2)} / ${ALPS_MAX_SSE} px`,distribution,loading:this.flight,maxConcurrent:this.maxConcurrent,prefetch:this.prefetchCells.size,triangles:visible.reduce((s,e)=>s+Number(e.tile.triangles),0),altitude:this.altitude,sse:this.sse,geometryBytes,textureBytes,geometryBudget:this.geometryBudget,textureBudget:this.textureBudget,networkBudget:this.networkBudget};
  }
  get coverageDebug(){const b=this.manifest.bounds as AlpsBounds;return `bbox ${b.minLon}..${b.maxLon} / ${b.minLat}..${b.maxLat}\nvisible IDs: ${this.entries.filter(e=>e.object?.visible).map(e=>`${e.tile.tile_id} (${e.tile.region_name??'MontBlanc'})`).join(', ')}`;}
  audit(){return {stats:this.stats,bounds:this.manifest.bounds,visibleTiles:this.entries.filter(e=>e.object?.visible).map(e=>({id:e.tile.tile_id,region:e.tile.region_name,lod:e.tile.lod})),source:'Copernicus DEM native meters',textureDetailLimited:false};}
  setBorders(value:boolean){this.debug=value;}
  dispose(){this.disposed=true;this.abort.abort();for(const e of this.entries)if(e.object)disposeTerrainObject(e.object);this.cache.clear();this.root.removeFromParent();}
}
