import fs from 'node:fs';
import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { prepareCountryIndex,getCountryAtLatLng,polygonContains,unwrapRing,getCountryContent } from './countries';
import { createCountryHighlight,disposeCountryHighlight } from './country-highlight';
import { screenPointToEarthLatLng,countryCameraTarget } from './country-camera';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const data=JSON.parse(fs.readFileSync(new URL('../../public/data/country-borders-50m.geojson',import.meta.url),'utf8'));
const index=prepareCountryIndex(data);
describe('country geography',()=>{
  it.each([['UA',49,32],['PL',52,20],['NE',17,9],['IT',42,13],['FR',47,2],['TR',39,35],['EG',27,30],['IL',31,34.8],['SA',24,45],['IN',22,79],['ZA',-29,25]] as const)('detects %s from real polygons',(code,lat,lon)=>expect(getCountryAtLatLng(index,lat,lon)?.info.code).toBe(code));
  it.each([[34,20],[43,34],[42,51],[0,-30]])('does not select a country in water %s %s',(lat,lon)=>expect(getCountryAtLatLng(index,lat,lon)).toBeNull());
  it('reuses preprocessing and keeps unavailable content explicit',()=>{expect(prepareCountryIndex(data)).toBe(index);expect(getCountryContent('UA')).toMatchObject({countryCode:'UA',available:false,eventsCount:null});});
  it('supports holes and an antimeridian ring without selecting the opposite hemisphere',()=>{
    const rings=[unwrapRing([[179,-5],[-179,-5],[-179,5],[179,5],[179,-5]]),unwrapRing([[179.5,-1],[-179.5,-1],[-179.5,1],[179.5,1],[179.5,-1]])];
    const polygon={rings,bbox:[179,-5,181,5] as [number,number,number,number],area:20};
    expect(polygonContains(polygon,3,-179.5)).toBe(true);expect(polygonContains(polygon,0,180)).toBe(false);expect(polygonContains(polygon,3,0)).toBe(false);
  });
  it('indexes source features with ISO keys and localized capital metadata',()=>{expect(data.features.length).toBe(242);expect(index.countries.length).toBe(239);expect(index.byCode.get('UA')!.info.capital!.uk).toBe('Київ');});
});
it('keeps every representative point inside its own country', () => {
  for (const country of index.countries) expect(country.polygons.some(p => polygonContains(p, country.point.latitude, country.point.longitude)), country.info.code).toBe(true);
});
describe('curved country overlay',()=>{
  it.each(['UA','IT','FJ'])('builds %s above the surface with a triangulated fill',(code)=>{
    const h=createCountryHighlight(index.byCode.get(code)!);const points=h.fill.geometry.attributes.position;let min=Infinity,max=0;
    for(let i=0;i<points.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(points,i),b=new THREE.Vector3().fromBufferAttribute(points,i+1),c=new THREE.Vector3().fromBufferAttribute(points,i+2);min=Math.min(min,a.clone().add(b).add(c).divideScalar(3).length());max=Math.max(max,a.length(),b.length(),c.length());}
    expect(points.count).toBeGreaterThan(3);expect(min).toBeGreaterThan(1);expect(max).toBeLessThan(1.005);expect(h.fill.material.depthTest).toBe(true);expect(h.fill.material.opacity).toBeLessThan(.3);disposeCountryHighlight(h);
  });
  it('converts ray hits through a rotated geographic frame back to latitude/longitude',()=>{
    const world=new THREE.Group(),frame=new THREE.Group(),earth=new THREE.Mesh(new THREE.SphereGeometry(1,64,48),new THREE.MeshBasicMaterial());world.add(frame,earth);world.rotation.y=Math.PI/2;world.updateMatrixWorld(true);
    const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.set(4,0,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const point=screenPointToEarthLatLng(50,50,{left:0,top:0,width:100,height:100},camera,earth,frame,new THREE.Vector3(),new THREE.Raycaster());expect(point!.longitude).toBeCloseTo(0);expect(point!.latitude).toBeCloseTo(0);
  });
  it('fits larger countries farther away and respects existing safe zoom',()=>{
    const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.z=6;
    const controls={minDistance:3,maxDistance:10,minZoom:.5,maxZoom:3} as OrbitControls;
    const frame=new THREE.Group(),center=new THREE.Vector3();
    const small=countryCameraTarget(index.byCode.get('IL')!,camera,frame,center,1.8,controls);const big=countryCameraTarget(index.byCode.get('RU')!,camera,frame,center,1.8,controls);
    expect(small.position.length()).toBeGreaterThanOrEqual(3-1e-8);expect(big.position.length()).toBeGreaterThan(small.position.length());expect(big.position.length()).toBeLessThanOrEqual(10);
  });
});
