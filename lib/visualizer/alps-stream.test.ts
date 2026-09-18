import { describe, expect, it } from 'vitest';
import { screenSpaceError, selectAlpsLod } from './alps-stream';
import { parseTerrainManifest, terrainPrefix } from '../terrain/contract';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { alpsPointFactory, alpsDemSampler } from './alps-spherical';

describe('local Alps LOD selection',()=>{
  it('scales with viewport, distance and vertical FOV',()=>{
    const a=screenSpaceError(100,10000,Math.PI/3,1000);
    expect(screenSpaceError(100,20000,Math.PI/3,1000)).toBeCloseTo(a/2);
    expect(screenSpaceError(100,10000,Math.PI/3,2000)).toBeCloseTo(a*2);
    expect(screenSpaceError(100,10000,Math.PI/2,1000)).toBeLessThan(a);
  });
  it('keeps the current level in the hysteresis band',()=>{
    const errors=[300,75,0],fov=Math.PI/3,height=1000;
    const distance=300*height/(2*Math.tan(fov/2)*2.6);
    expect(selectAlpsLod(errors,distance,fov,height,0)).toBe(0);
    expect(selectAlpsLod(errors,distance,fov,height,1)).toBe(1);
    expect(selectAlpsLod(errors,500,fov,height,0)).toBe(2);
  });
  it('does not enable L0 in the production storage contract',()=>{
    expect(()=>terrainPrefix('alps',0)).toThrow();
  });
  it.skipIf(!existsSync('tools/terrain/alps/build/L2/manifest.json'))('validates all generated local manifests',()=>{
    for(const lod of [0,1,2]){
      const m=JSON.parse(readFileSync(`tools/terrain/alps/build/L${lod}/manifest.json`,'utf8'));
      expect(parseTerrainManifest(m,true).tiles).toHaveLength(m.grid.countX*m.grid.countY);
      if(lod===0)expect(()=>parseTerrainManifest(m)).toThrow();
      expect(Math.max(...m.tiles.map((t:{height_max:number})=>t.height_max))).toBeLessThan(4811);
    }
  });
  it.skipIf(!existsSync('tools/terrain/alps/build/L2/heights.bin'))('measures the closest DEM triangle at the 10 m Mont Blanc camera position',()=>{
    const m=JSON.parse(readFileSync('tools/terrain/alps/build/L2/manifest.json','utf8'));
    const bytes=readFileSync('tools/terrain/alps/build/L2/heights.bin');
    const h=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
    const lat=45.83278,lon=6.86472,x=(lon-m.bounds.minLon)*3600,y=(lat-m.bounds.minLat)*3600,i=Math.floor(x),j=Math.floor(y),width=m.grid.countX*252+1;
    const height=alpsDemSampler(m,h)(lat,lon)!;
    const spherical=alpsPointFactory(m,1.8);
    const point=(lat:number,lon:number,height:number)=>spherical(lat,lon,height).multiplyScalar(100000);
    const camera=point(lat,lon,height+10),closest=new THREE.Vector3();let distance=Infinity;
    for(let row=j-3;row<=j+3;row++)for(let col=i-3;col<=i+3;col++){
      const p=(a:number,b:number)=>point(m.bounds.minLat+b/3600,m.bounds.minLon+a/3600,h[b*width+a]);
      for(const triangle of [new THREE.Triangle(p(col,row),p(col+1,row),p(col,row+1)),new THREE.Triangle(p(col+1,row),p(col+1,row+1),p(col,row+1))])distance=Math.min(distance,triangle.closestPointToPoint(camera,closest).distanceTo(camera));
    }
    console.log('Mont Blanc nearest DEM triangle clearance (m):',distance);
    expect(distance).toBeGreaterThan(8);
    expect(distance).toBeLessThanOrEqual(10.1);
  });
});
