// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCapitalCitiesLayer, type CapitalCity } from './capital-cities';

afterEach(()=>vi.restoreAllMocks());
it('shows CITY only at close zoom, independently from capitals, and hides it on zoom out',()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({measureText:(name:string)=>({width:name.length*7})} as unknown as CanvasRenderingContext2D);
  const canvas=document.createElement('canvas'),labels=document.createElement('div'),frame=new THREE.Group();
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:640,height:480} as DOMRect);
  const borders=new THREE.LineSegments();borders.userData.earthRadius=1.8;
  const camera=new THREE.PerspectiveCamera(45,640/480,.00001,100);camera.position.z=3;camera.lookAt(0,0,0);
  const city:CapitalCity={id:'city',countryIso2:'XX',countryName:'Test',name:'City',nameLocal:'City',names:{en:'City'},lat:0,lon:0,scalerank:3,population:1000000,featureClass:'Populated place',source:'test'};
  let citiesEnabled=true;
  const layer=createCapitalCitiesLayer({cities:[city],frame,borders,canvas,labels,camera:()=>camera,locale:()=> 'en',enabled:()=>false,citiesEnabled:()=>citiesEnabled,available:()=>true,elevation:()=>null,terrain:()=>null,onSelect:()=>{}});
  layer.tick(1);expect(labels.dataset.visibleMarkers).toBe('0');expect(labels.children).toHaveLength(0);
  camera.position.z=1.8*(1+100000/6371000);layer.tick(2);
  expect(labels.querySelector('[data-place-tier="city"]')?.textContent).toBe('City');
  expect(labels.querySelector('button')?.style.fontSize).toBe('11px');
  citiesEnabled=false;layer.tick(3);expect(labels.hidden).toBe(true);
  citiesEnabled=true;camera.position.z=3;layer.tick(4);expect(labels.children).toHaveLength(0);
  layer.dispose();
});
it('culls the rear hemisphere and terrain occluders, toggles and disposes independently',()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({measureText:(name:string)=>({width:name.length*7})} as unknown as CanvasRenderingContext2D);
  const canvas=document.createElement('canvas'),labels=document.createElement('div'),frame=new THREE.Group();
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:640,height:480} as DOMRect);
  const borders=new THREE.LineSegments();borders.userData.earthRadius=1.8;
  const camera=new THREE.PerspectiveCamera(45,640/480,0.01,100);camera.position.set(0,0,6);camera.lookAt(0,0,0);
  const city:CapitalCity={id:'front',countryIso2:'XX',countryName:'Test',name:'Front',nameLocal:'Front',names:{en:'Front'},lat:0,lon:0,scalerank:0,population:100,featureClass:'Admin-0 capital',source:'test only'};
  let enabled=true,terrain:THREE.Object3D|null=null;
  const select=vi.fn();
  const layer=createCapitalCitiesLayer({cities:[city,{...city,id:'rear',name:'Rear',lon:180}],frame,borders,canvas,labels,camera:()=>camera,locale:()=> 'en',enabled:()=>enabled,available:()=>true,elevation:()=>null,terrain:()=>terrain,onSelect:select});
  layer.tick(1);
  expect(labels.dataset.visibleMarkers).toBe('1');expect(labels.textContent).toBe('Front');
  labels.querySelector('button')!.click();expect(select).toHaveBeenCalledWith(city);
  const obstacle=new THREE.Mesh(new THREE.SphereGeometry(0.2),new THREE.MeshBasicMaterial());obstacle.position.z=2.3;obstacle.updateMatrixWorld();terrain=obstacle;
  layer.tick(2);expect(labels.dataset.visibleMarkers).toBe('0');expect(labels.children).toHaveLength(0);
  enabled=false;layer.tick(3);expect(labels.hidden).toBe(true);
  enabled=true;terrain=null;layer.tick(4);expect(labels.hidden).toBe(false);expect(labels.children).toHaveLength(1);
  const points=frame.getObjectByName('CapitalCitiesLayer') as THREE.Points;
  const dispose=vi.spyOn(points.geometry,'dispose');layer.dispose();expect(dispose).toHaveBeenCalledOnce();expect(frame.children).toHaveLength(0);expect(labels.children).toHaveLength(0);
});
