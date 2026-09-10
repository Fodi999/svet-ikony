import * as THREE from 'three';
import type { TerrainManifest } from '../terrain/contract';
import { latLngToVector3 } from './geography';
import { projectTerrainPoint } from './terrain-projection';
export type TerrainCoordinates = { origin: { latitude: number; longitude: number }; metersPerUnit: number; earthRadiusMeters: number; heightExaggeration: number };
export function terrainRootMatrix(manifest: TerrainManifest, radius: number, center: THREE.Vector3) {
  const c = manifest.coordinateSystem as TerrainCoordinates;
  const lat = THREE.MathUtils.degToRad(c.origin.latitude), lon = THREE.MathUtils.degToRad(c.origin.longitude);
  const east = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const up = latLngToVector3(c.origin.latitude, c.origin.longitude, 1);
  const south = new THREE.Vector3(Math.sin(lat) * Math.sin(lon), -Math.cos(lat), Math.sin(lat) * Math.cos(lon));
  const scale = radius * c.metersPerUnit / c.earthRadiusMeters;
  return new THREE.Matrix4().makeBasis(east.multiplyScalar(scale), up.clone().multiplyScalar(scale), south.multiplyScalar(scale)).setPosition(center.clone().addScaledVector(up, radius));
}
/** Exact source projection, used for grid diagnostics and quantitative anchors.
 * AEQD arc lengths are not spherical chords: a rigid root cannot erase that
 * nonlinear residual. Report it rather than adjusting individual tiles. */
export function terrainPoint(manifest: TerrainManifest, latitude: number, longitude: number, elevation = 0) {
  const c = manifest.coordinateSystem as TerrainCoordinates, rad = Math.PI / 180;
  const p = latitude * rad, p0 = c.origin.latitude * rad, dl = (longitude - c.origin.longitude) * rad;
  const cos = THREE.MathUtils.clamp(Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(dl), -1, 1);
  const angle = Math.acos(cos), k = angle < 1e-10 ? 1 : angle / Math.sin(angle), r = c.earthRadiusMeters / c.metersPerUnit;
  return new THREE.Vector3(r*k*Math.cos(p)*Math.sin(dl), r*(cos-1)+elevation*c.heightExaggeration/c.metersPerUnit, -r*k*(Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(dl)));
}
export function terrainAnchorErrors(manifest: TerrainManifest, radius: number, center: THREE.Vector3) {
  const c = manifest.coordinateSystem as TerrainCoordinates, matrix = terrainRootMatrix(manifest, radius, center);
  const anchors = manifest.anchors as {id:string;latitude:number;longitude:number;position?:number[]}[];
  return anchors.filter(a => ['Kyiv','Lviv','Odesa','Kharkiv'].includes(a.id)).map(a => {
    const actual = projectTerrainPoint(a.position ? new THREE.Vector3().fromArray(a.position) : terrainPoint(manifest,a.latitude,a.longitude),c.earthRadiusMeters/c.metersPerUnit).applyMatrix4(matrix).sub(center).normalize();
    const expected = latLngToVector3(a.latitude,a.longitude,1);
    return { id:a.id, meters:actual.angleTo(expected)*c.earthRadiusMeters };
  });
}
export function createTileBorders(root: THREE.Group, manifest: TerrainManifest) {
  const positions:number[]=[];
  // Extract the actual tile perimeter lattice. It includes terrain elevations,
  // so diagnostic lines sit on the same surface, never a flat bounding box.
  for (const tile of manifest.tiles) {
    const tileRoot = root.getObjectByName(tile.tile_id); if (!tileRoot) continue;
    const [nx,ny] = tile.vertex_resolution as number[];
    tileRoot.updateMatrixWorld(true);
    tileRoot.traverse(node => { const mesh=node as THREE.Mesh; if(!mesh.geometry)return; const p=mesh.geometry.getAttribute('position');if(p.count<nx*ny)return;
      const indices:number[]=[];for(let x=0;x<nx;x++)indices.push(x);for(let y=1;y<ny;y++)indices.push(y*nx+nx-1);for(let x=nx-2;x>=0;x--)indices.push((ny-1)*nx+x);for(let y=ny-2;y>=0;y--)indices.push(y*nx);
      for(let i=1;i<indices.length;i++) for(const index of [indices[i-1],indices[i]]) { const v=new THREE.Vector3().fromBufferAttribute(p,index);v.y+=0.006;positions.push(v.x,v.y,v.z); }
    });
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xe8c77a,transparent:true,opacity:0.9,depthTest:true,depthWrite:false}));lines.name='TileBorders';lines.visible=false;return lines;
}
