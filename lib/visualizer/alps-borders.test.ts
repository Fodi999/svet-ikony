import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { existsSync, readFileSync } from 'node:fs';
import { AlpsBorders, alpsBorderSample, clipAlpsSegment, ALPS_BORDER_OFFSET_METERS } from './alps-borders';
import { countryBorderPositions, type CountryData } from './country-borders';
import { terrainRootMatrix } from './terrain-alignment';
import { latLngToVector3 } from './geography';
import type { AlpsStream } from './alps-stream';
import { alpsDemSampler } from './alps-spherical';

const available=existsSync('tools/terrain/alps/build/L2/manifest.json')&&existsSync('tools/terrain/alps/build/L2/heights.bin');
const manifest=available?JSON.parse(readFileSync('tools/terrain/alps/build/L2/manifest.json','utf8')):null;
const data=JSON.parse(readFileSync('public/data/country-borders-50m.geojson','utf8')) as CountryData;
const bytes=available?readFileSync('tools/terrain/alps/build/L2/heights.bin'):Buffer.alloc(0);
const dem=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const sample=available?alpsDemSampler(manifest,dem):()=>null;
const heightAt=(lat:number,lon:number)=>sample(lat,lon)??NaN;
function setup(positions:Float32Array,code?:string){
  const frame=new THREE.Group(),root=new THREE.Group(),center=new THREE.Vector3(.03,-.02,.01);
  const original=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3));
  const source=new THREE.LineSegments(original,new THREE.LineBasicMaterial({depthTest:false,depthWrite:true}));
  const borders=code?new THREE.LineSegments():source;
  borders.position.copy(center);borders.scale.setScalar(1.8*1.003);
  frame.add(borders,root);
  if(code){const group=new THREE.Group();group.name=`CountryHighlight:${code}`;group.position.copy(center);group.scale.setScalar(1.8);group.add(source);frame.add(group);}
  root.matrix.copy(terrainRootMatrix(manifest,1.8,center));root.matrixAutoUpdate=false;
  const stream={manifest,root,renderHeightAt:heightAt,surfaceRevision:'L2'} as unknown as AlpsStream;
  const manager=new AlpsBorders(frame,borders,stream,1.8);
  return {manager,source,original,root,frame,center};
}
const geographic=(p:THREE.Vector3):[number,number]=>[THREE.MathUtils.radToDeg(Math.atan2(p.x,p.z)),THREE.MathUtils.radToDeg(Math.asin(p.y/p.length()))];
const positionsOf=(line:LineSegments2)=>new THREE.BufferAttribute(
  (line.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data.array,3);

describe.skipIf(!available)('Alps border replacement',()=>{
  it('has a continuous transition outside the DEM, without an elevated ramp inside it',()=>{
    const ground=()=>2300,globe=6371000*.0044;
    expect(alpsBorderSample(45.85,6.98,globe,ground)).toBe(2330);
    expect(alpsBorderSample(45.85,6.98-1e-6,globe,ground)).toBe(2330);
    expect(Math.abs(alpsBorderSample(45.85,6.98+1e-6,globe,ground)!-2330)).toBeLessThan(.001);
    expect(alpsBorderSample(45.85,7.5,globe,ground)).toBe(globe);
    expect(alpsBorderSample(45.85,6.9,globe,()=>null)).toBeNull();
  });
  for(const code of ['FR','IT','CH'])it(`replaces ${code} global and highlighted segments, preserves globe mode`,()=>{
    const positions=countryBorderPositions({...data,features:data.features.filter(f=>f.properties?.code===code)});
    for(let i=0;i<positions.length;i++)positions[i]*=1.0044;
    const {manager,source,original,root,frame,center}=setup(positions,code);
    manager.update(true,true);frame.updateWorldMatrix(true,true);
    const audit=manager.audit();expect(audit.originalsHidden).toBe(true);expect(audit.globalSegmentsReplaced).toBeGreaterThan(0);
    expect(source.material.visible).toBe(false);
    const outside=source.geometry.getAttribute('position');
    for(let i=0;i<outside.count;i+=2){
      const a=geographic(new THREE.Vector3().fromBufferAttribute(outside,i)),b=geographic(new THREE.Vector3().fromBufferAttribute(outside,i+1));
      expect(clipAlpsSegment(a,b)).toBeNull();
    }
    const line=root.getObjectByName('AlpsDrapedBorder') as LineSegments2;
    const outline=root.getObjectByName('AlpsDrapedBorderOutline') as LineSegments2;
    expect(line.material.linewidth).toBe(3);expect(outline.material.linewidth).toBe(5.5);
    expect(line.material.worldUnits).toBe(false);expect(line.material.opacity).toBe(1);
    expect(outline.geometry).toBe(line.geometry);expect(outline.material.depthTest).toBe(true);
    expect(outline.material.depthWrite).toBe(false);expect(outline.renderOrder).toBeLessThan(line.renderOrder);
    expect(line.material.fragmentShader).toContain('alpha * vBorderAlpha');
    expect(line.material.depthTest).toBe(true);expect(line.material.depthWrite).toBe(false);expect(line.material.polygonOffset).toBe(false);expect(line.renderOrder).toBeGreaterThan(0);
    const p=positionsOf(line);let within=0,minClearance=Infinity,minHeight=Infinity,maxHeight=-Infinity,maxStep=0;
    const colors=line.geometry.getAttribute('borderAlpha');expect(colors.itemSize).toBe(2);
    expect(Array.from(colors.array).some(alpha=>alpha===0)).toBe(true);
    const world=(i:number)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(root.matrixWorld).sub(center);
    for(let i=0;i<p.count;i+=2){
      const a=world(i),b=world(i+1);maxStep=Math.max(maxStep,a.angleTo(b)*6371000);
      for(const t of [0,.25,.5,.75,1]){
        const v=a.clone().lerp(b,t),[lon,lat]=geographic(v);
        if(lon<6.7||lon>6.98||lat<45.75||lat>45.95)continue;
        const ground=heightAt(lat,lon),height=(v.length()/1.8-1)*6371000;
        within++;minClearance=Math.min(minClearance,height-ground);minHeight=Math.min(minHeight,ground);maxHeight=Math.max(maxHeight,ground);
        if(t===0||t===1)expect(Math.abs(height-ground-ALPS_BORDER_OFFSET_METERS)).toBeLessThan(.01);
      }
    }
    expect(maxStep).toBeLessThan(50.1);
    if(code==='FR'||code==='IT'){expect(within).toBeGreaterThan(100);expect(maxHeight-minHeight).toBeGreaterThan(500);expect(minClearance).toBeGreaterThan(0);}
    console.log(code,{within,minClearance,maxStep,replaced:audit.globalSegmentsReplaced});
    const replacement=source.geometry;
    manager.update(true,false);expect(source.material.visible).toBe(true);
    for(const alpha of colors.array)expect(alpha).toBe(1);
    manager.update(false,false);expect(source.geometry).toBe(original);expect(line.visible).toBe(false);expect(source.material.visible).toBe(true);
    manager.update(true,true);expect(source.geometry).toBe(replacement);expect(line.visible).toBe(true);
    source.parent!.visible=false;manager.update(true,true);expect(line.visible).toBe(false);expect(outline.visible).toBe(false);
    manager.dispose();expect(root.children).toHaveLength(0);original.dispose();source.material.dispose();
  });
  it('removes entire crossing segments instead of leaving elevated fragments at the DEM edge',()=>{
    const positions=new Float32Array([...latLngToVector3(45.85,manifest.bounds.minLon-.7,1).toArray(),...latLngToVector3(45.85,manifest.bounds.maxLon+.7,1).toArray()]);
    const {manager,source,root,original,frame}=setup(positions);
    manager.update(true,true);expect(source.geometry.getAttribute('position').count).toBe(0);
    frame.updateWorldMatrix(true,true);
    const line=root.getObjectByName('AlpsDrapedBorder') as LineSegments2,p=positionsOf(line);
    for(const [a,b] of [[0,0],[p.count-1,1]]){
      const actual=new THREE.Vector3().fromBufferAttribute(p,a).applyMatrix4(root.matrixWorld);
      const expected=new THREE.Vector3().fromBufferAttribute(original.getAttribute('position'),b).applyMatrix4(source.matrixWorld);
      expect(actual.distanceTo(expected)*6371000/1.8).toBeLessThan(.01);
    }
    manager.dispose();expect(source.geometry).toBe(original);original.dispose();source.material.dispose();
  });
});
