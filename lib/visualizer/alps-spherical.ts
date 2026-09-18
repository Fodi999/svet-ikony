import * as THREE from 'three';
import type { TerrainManifest, TerrainTile } from '../terrain/contract';
import { latLngToVector3 } from './geography';
import { terrainRootMatrix } from './terrain-alignment';

export const EARTH_METERS = 6371000;
export type AlpsBounds={minLon:number;maxLon:number;minLat:number;maxLat:number};
export function alpsDemSampler(manifest:TerrainManifest, native:Float32Array) {
  const b=manifest.bounds as AlpsBounds,width=manifest.grid.countX*252+1,height=manifest.grid.countY*180+1;
  if(native.length!==width*height)throw new Error('Invalid native DEM dimensions');
  return (lat:number,lon:number):number|null=>{
    if(lat<b.minLat-1e-10||lat>b.maxLat+1e-10||lon<b.minLon-1e-10||lon>b.maxLon+1e-10)return null;
    const x=THREE.MathUtils.clamp((lon-b.minLon)/(b.maxLon-b.minLon)*(width-1),0,width-1);
    const y=THREE.MathUtils.clamp((lat-b.minLat)/(b.maxLat-b.minLat)*(height-1),0,height-1);
    const i=Math.min(width-2,Math.floor(x)),j=Math.min(height-2,Math.floor(y)),u=x-i,v=y-j,a=native;
    return u+v<=1?a[j*width+i]*(1-u-v)+a[j*width+i+1]*u+a[(j+1)*width+i]*v:a[(j+1)*width+i+1]*(u+v-1)+a[j*width+i+1]*(1-v)+a[(j+1)*width+i]*(1-u);
  };
}

/** Direct globe XYZ, rebased in the existing regional frame before Float32 storage.
 * The frame is only a rigid basis/scale, not an AEQD projection. */
export function alpsPointFactory(manifest:TerrainManifest, radius:number) {
  const inverse=terrainRootMatrix(manifest,radius,new THREE.Vector3()).invert();
  return (lat:number,lon:number,height:number)=>latLngToVector3(lat,lon,radius*(1+height/EARTH_METERS)).applyMatrix4(inverse);
}

export function rebuildAlpsGeometry(root:THREE.Object3D,tile:TerrainTile,point:ReturnType<typeof alpsPointFactory>,heightAt:(lat:number,lon:number)=>number|null,bounds:AlpsBounds={minLon:6.7,maxLon:6.98,minLat:45.75,maxLat:45.95}) {
  const [nx,ny]=tile.vertex_resolution as number[];
  root.traverse(node=>{
    const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;
    const g=mesh.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv');
    const normals=new THREE.Float32BufferAttribute(p.count*3,3);
    if(!uv||uv.count!==p.count||p.count<nx*ny)throw new Error('Invalid Alps lattice');
    for(let k=0;k<p.count;k++){
      const u=uv.getX(k),v=uv.getY(k);
      if(!Number.isFinite(u+v)||u<0||u>1||v<0||v>1)throw new Error('Invalid Alps UV');
      // Round UV back to the exact shared lattice; Float32 UVs are not geography.
      const i=Math.round(u*(nx-1)),j=Math.round((1-v)*(ny-1));
      const lat=tile.min_lat+j/(ny-1)*(tile.max_lat-tile.min_lat),lon=tile.min_lon+i/(nx-1)*(tile.max_lon-tile.min_lon);
      const height=heightAt(lat,lon);
      if(height===null||!Number.isFinite(height))throw new Error('Missing Alps elevation');
      const v3=point(lat,lon,height-(k>=nx*ny?Number(tile.skirt_depth_m):0));
      p.setXYZ(k,v3.x,v3.y,v3.z);
      const sample=(la:number,lo:number)=>point(la,lo,heightAt(la,lo)??height);
      const west=Math.max(bounds.minLon,lon-1/3600),east=Math.min(bounds.maxLon,lon+1/3600),south=Math.max(bounds.minLat,lat-1/3600),north=Math.min(bounds.maxLat,lat+1/3600);
      const normal=sample(lat,east).sub(sample(lat,west)).cross(sample(north,lon).sub(sample(south,lon))).normalize();
      normals.setXYZ(k,normal.x,normal.y,normal.z);
    }
    // Shared DEM derivatives avoid skirt normals and one-sided tile-edge shading seams.
    g.setAttribute('normal',normals);
    p.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
    g.userData.terrainProjected=true;mesh.frustumCulled=true;
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      const map=(m as THREE.MeshStandardMaterial).map;
      if(map){map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;map.needsUpdate=true;}
    }
  });
}

export function alpsDepthRange(radius:number,distance:number,originalNear:number) {
  const unit=radius/EARTH_METERS;
  // Bound against the highest terrain, not just the ground below the camera.
  const gap=Math.max(0,distance-radius-5000*unit);
  return {near:Math.min(originalNear,Math.max(0.5*unit,gap*0.2)),far:Math.max(radius*2,distance+radius*1.1)};
}
