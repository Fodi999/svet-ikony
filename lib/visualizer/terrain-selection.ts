import * as THREE from 'three';
import type { TerrainManifest,TerrainTile } from '../terrain/contract';
import { terrainPoint,type TerrainCoordinates } from './terrain-alignment';
import { projectTerrainPoint } from './terrain-projection';
import { TERRAIN_PERFORMANCE as CONFIG } from './terrain-config';
/** Conservative bounds in projected TerrainRoot coordinates, computed once. */
export function terrainTileBounds(manifest:TerrainManifest,tile:TerrainTile){
 const c=manifest.coordinateSystem as TerrainCoordinates,r=c.earthRadiusMeters/c.metersPerUnit,box=new THREE.Box3();
 const n=CONFIG.boundsSamples;
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)for(const h of [Math.min(0,Number(tile.height_min)||0),Number(tile.height_max)||0]){
  box.expandByPoint(projectTerrainPoint(terrainPoint(manifest,tile.min_lat+(tile.max_lat-tile.min_lat)*y/n,tile.min_lon+(tile.max_lon-tile.min_lon)*x/n,h),r));
 }
 return box.expandByScalar(r*CONFIG.boundsPaddingRatio);
}
export function neighborIds(tiles:TerrainTile[],visible:Set<string>,budget:number){
 const neighbors=new Set<string>();
 for(const t of tiles)if(visible.has(t.tile_id))for(const other of tiles){if(neighbors.size>=budget)break;if(!visible.has(other.tile_id)&&Math.abs(t.x-other.x)+Math.abs(t.y-other.y)===1)neighbors.add(other.tile_id);}
 return neighbors;
}
export type SelectionVolume={tile:TerrainTile;localBox:THREE.Box3;worldBox:THREE.Box3;sphere:THREE.Sphere;score:number};
export class TerrainSelector {
 private frustum=new THREE.Frustum();private matrix=new THREE.Matrix4();private previousCamera=new THREE.Matrix4();private previousProjection=new THREE.Matrix4();private previousRoot=new THREE.Matrix4();private previousFrame=new THREE.Matrix4();private direction=new THREE.Vector3();private point=new THREE.Vector3();private center=new THREE.Vector3();
 private last=-Infinity;private previousActive=false;private dirty=true;
 evaluations=0;
 constructor(readonly volumes:SelectionVolume[],private radius:number,private mobile:boolean){}
 invalidate(){this.dirty=true;}
 select(camera:THREE.Camera,root:THREE.Group,active:boolean,now:number){
  camera.updateMatrixWorld();root.parent?.updateWorldMatrix(true,false);
  const rootChanged=!root.matrix.equals(this.previousRoot)||!!(root.parent&&!root.parent.matrixWorld.equals(this.previousFrame));
  const changed=this.dirty||active!==this.previousActive||!camera.matrixWorld.equals(this.previousCamera)||!camera.projectionMatrix.equals(this.previousProjection)||rootChanged;
  if(!changed||now-this.last<CONFIG.selectionIntervalMs)return null;
  this.last=now;this.dirty=false;this.previousActive=active;this.previousCamera.copy(camera.matrixWorld);this.previousProjection.copy(camera.projectionMatrix);this.previousRoot.copy(root.matrix);if(root.parent)this.previousFrame.copy(root.parent.matrixWorld);this.evaluations++;
  if(rootChanged){root.matrixWorldNeedsUpdate=true;root.updateWorldMatrix(true,false);for(const v of this.volumes){v.worldBox.copy(v.localBox).applyMatrix4(root.matrixWorld);v.worldBox.getBoundingSphere(v.sphere);}}
  this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  // The geographic frame is centered on Earth; root translation is its local tangent origin.
  root.parent?.getWorldPosition(this.center);this.direction.copy(camera.position).sub(this.center);const distance=this.direction.length();this.direction.normalize();
  const altitude=distance/this.radius-1,candidates:SelectionVolume[]=[];
  for(const v of this.volumes){this.point.copy(v.sphere.center).sub(this.center).normalize();
   v.score=camera.position.distanceToSquared(v.sphere.center);
   if(active&&altitude<=CONFIG.preloadAltitude&&this.frustum.intersectsBox(v.worldBox)&&this.point.dot(this.direction)>-v.sphere.radius/this.radius)candidates.push(v);
  }
  candidates.sort((a,b)=>a.score-b.score);
  const policy=this.mobile?CONFIG.mobile:CONFIG.desktop;
  const visible=new Set(altitude<=CONFIG.visibleAltitude?candidates.slice(0,policy.visibleBudget).map(v=>v.tile.tile_id):[]);
  const preload=new Set(candidates.slice(0,policy.visibleBudget).map(v=>v.tile.tile_id));
  for(const id of neighborIds(this.volumes.map(v=>v.tile),visible,policy.neighborBudget))preload.add(id);
  return{visible,preload,distance,altitude,veryFar:altitude>CONFIG.unloadAltitude};
 }
}
