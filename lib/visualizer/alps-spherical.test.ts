import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import { alpsDepthRange, alpsPointFactory, rebuildAlpsGeometry, alpsDemSampler, type AlpsBounds } from './alps-spherical';
import { terrainRootMatrix } from './terrain-alignment';
import { latLngToVector3 } from './geography';
import { AlpsBorders, clipAlpsSegment } from './alps-borders';
import type { AlpsStream } from './alps-stream';
import type { TerrainManifest } from '../terrain/contract';

const path='tools/terrain/alps/build';
describe('Alps spherical rendering regressions',()=>{
  it('uses a useful depth range at continent scale and restores close precision',()=>{
    const wide=alpsDepthRange(1.8,3,0.1),close=alpsDepthRange(1.8,1.8*(1+4820/6371000),0.1);
    expect(wide.near).toBe(0.1);expect(wide.far/wide.near).toBeLessThan(100);
    expect(close.near*6371000/1.8).toBeCloseTo(0.5);
    expect(close.far).toBeGreaterThan(3.6);
  });
  it('clips crossing border segments even when both ends lie outside the DEM',()=>{
    expect(clipAlpsSegment([6.5,45.85],[7.1,45.85])).toEqual([expect.closeTo(1/3),expect.closeTo(.8)]);
    expect(clipAlpsSegment([6.5,45.7],[7.1,45.7])).toBeNull();
    expect(clipAlpsSegment([6.8,45.8],[6.9,45.9])).toEqual([0,1]);
  });
  it.skipIf(!existsSync(`${path}/L2/manifest.json`))('places zero height and DEM heights on exactly the shared sphere',()=>{
    const m=JSON.parse(readFileSync(`${path}/L2/manifest.json`,'utf8')) as TerrainManifest;
    const point=alpsPointFactory(m,1.8),root=terrainRootMatrix(m,1.8,new THREE.Vector3());
    for(const lat of [45.75,45.83278,45.95])for(const lon of [6.7,6.86472,6.98])for(const height of [0,1000,4810.717285]){
      const actual=point(lat,lon,height).applyMatrix4(root);
      expect(actual.distanceTo(latLngToVector3(lat,lon,1.8*(1+height/6371000)))).toBeLessThan(1e-14);
      expect(Math.abs(actual.length()-1.8*(1+height/6371000))).toBeLessThan(1e-14);
    }
  });
  it.skipIf(!existsSync(`${path}/L2/manifest.json`))('drapes borders 30 m above the displayed surface and restores globe geometry',()=>{
    const manifest=JSON.parse(readFileSync(`${path}/L2/manifest.json`,'utf8')) as TerrainManifest;
    const frame=new THREE.Group(),root=new THREE.Group(),positions:number[]=[];
    for(const lon of [6.864,6.865])positions.push(...latLngToVector3(45.832,lon,1).toArray());
    const original=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const borders=new THREE.LineSegments(original,new THREE.LineBasicMaterial());frame.add(borders,root);
    let height=1500,revision='L0';
    const stream={manifest,root,renderHeightAt:()=>height,get surfaceRevision(){return revision;}} as unknown as AlpsStream;
    const manager=new AlpsBorders(frame,borders,stream,1.8),matrix=terrainRootMatrix(manifest,1.8,new THREE.Vector3());
    for(const h of [1500,1600]){
      height=h;revision=String(h);manager.update(true,true);
      const line=root.getObjectByName('AlpsDrapedBorder') as THREE.LineSegments;
      const segment=line.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
      const p=new THREE.BufferAttribute(segment.data.array,3);
      expect(p.count).toBeGreaterThanOrEqual(4);
      for(let i=0;i<p.count;i++){
        const measured=(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).length()/1.8-1)*6371000;
        expect(Math.abs(measured-h-30)).toBeLessThan(.001);
      }
    }
    expect(borders.geometry).not.toBe(original);
    manager.update(false,false);expect(borders.geometry).toBe(original);
    manager.dispose();expect(root.children).toHaveLength(0);original.dispose();borders.material.dispose();
  });
  it.skipIf(!existsSync(`${path}/L2/heights.bin`))('validates every runtime mesh, UV, radial height and triangle winding',()=>{
    const bytes=readFileSync(`${path}/L2/heights.bin`),dem=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
    const sample=alpsDemSampler(JSON.parse(readFileSync(`${path}/L2/manifest.json`,'utf8')),dem);
    const heightAt=(lat:number,lon:number)=>sample(lat,lon)??NaN;
    let triangles=0,maxHeightError=0;
    const edges=new Map<string,number[]>();
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
    for(const lod of [0,1,2]){
      const m=JSON.parse(readFileSync(`${path}/L${lod}/manifest.json`,'utf8')) as TerrainManifest;
      const rootMatrix=terrainRootMatrix(m,1.8,new THREE.Vector3()),point=alpsPointFactory(m,1.8);
      for(const tile of m.tiles){
        const glb=readFileSync(`${path}/L${lod}/${tile.file}`),jsonLength=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+jsonLength).toString()),bin=glb.subarray(28+jsonLength);
        const attribute=(index:number)=>{
          const ac=doc.accessors[index],view=doc.bufferViews[ac.bufferView],offset=(view.byteOffset??0)+(ac.byteOffset??0),size=ac.type==='VEC3'?3:ac.type==='VEC2'?2:1;
          const bytes=bin.subarray(offset,offset+ac.count*size*(ac.componentType===5123?2:4));
          const copy=Uint8Array.from(bytes).buffer;
          return new THREE.BufferAttribute(ac.componentType===5126?new Float32Array(copy):ac.componentType===5123?new Uint16Array(copy):new Uint32Array(copy),size);
        };
        const primitive=doc.meshes[0].primitives[0],g=new THREE.BufferGeometry().setAttribute('position',attribute(primitive.attributes.POSITION)).setAttribute('uv',attribute(primitive.attributes.TEXCOORD_0)).setIndex(attribute(primitive.indices));
        const texture=new THREE.Texture();texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:texture}));
        rebuildAlpsGeometry(mesh,tile,point,heightAt,m.bounds as AlpsBounds);
        expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
        const p=g.getAttribute('position'),index=g.index!,[nx,ny]=tile.vertex_resolution as number[];
        for(let k=0;k<p.count;k++){
          a.fromBufferAttribute(p,k);if(!Number.isFinite(a.lengthSq()))throw new Error('Nonfinite geometry');
          if(k<nx*ny){
            const lat=tile.min_lat+Math.floor(k/nx)/(ny-1)*(tile.max_lat-tile.min_lat),lon=tile.min_lon+(k%nx)/(nx-1)*(tile.max_lon-tile.min_lon);
            if(k<nx||k>=nx*(ny-1)||k%nx===0||k%nx===nx-1){
              const key=`${lat.toFixed(10)},${lon.toFixed(10)}`,previous=edges.get(key),n=g.getAttribute('normal');
              const values=[p.getX(k),p.getY(k),p.getZ(k),n.getX(k),n.getY(k),n.getZ(k)];
              if(previous)for(let q=0;q<6;q++)if(Math.abs(previous[q]-values[q])>1e-6)throw new Error('Shared vertex/normal mismatch');
              edges.set(key,values);
            }
            const height=(a.applyMatrix4(rootMatrix).length()/1.8-1)*6371000;
            maxHeightError=Math.max(maxHeightError,Math.abs(height-heightAt(lat,lon)));
          }
        }
        for(let k=0;k<index.count;k+=3){
          const ids=[index.getX(k),index.getX(k+1),index.getX(k+2)];
          if(ids.some(id=>id>=p.count))throw new Error('Invalid index');
          a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
          normal.copy(b).sub(a).cross(c.clone().sub(a));
          if(normal.lengthSq()<1e-24)throw new Error('Degenerate triangle');
          if(k<Number(tile.surface_triangles)*3&&normal.y<=0)throw new Error('Inverted surface');
          triangles++;
        }
        g.dispose();mesh.material.dispose();texture.dispose();
      }
    }
    console.log({triangles,maxHeightError});
    expect(maxHeightError).toBeLessThan(.01);expect(triangles).toBeGreaterThan(1500000);
  },30000);
});
