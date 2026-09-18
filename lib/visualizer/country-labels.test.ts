// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCountryLabels } from './country-labels';
import type { Country } from './countries';
import { latLngToVector3 } from './geography';

it('localizes labels, rejects rear/overlapping countries, hides close terrain and disposes', () => {
  const country=(code:string,lon:number):Country => ({info:{code,name:{uk:'Країна',ru:'Страна',en:'Country'},iso2:null,iso3:null,capital:null,continent:'',representative:[lon,0]},point:{latitude:0,longitude:lon},angularExtent:20,polygons:[],feature:{geometry:{type:'Polygon',coordinates:[]}}});
  const countries=[country('front',0),country('overlap',0),country('rear',180)];
  const container=document.createElement('div'),canvas=document.createElement('canvas');
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({width:800,height:600,left:0,top:0} as DOMRect);
  const camera=new THREE.PerspectiveCamera(45,800/600,.01,100);
  camera.position.copy(latLngToVector3(0,0,3));camera.lookAt(0,0,0);
  const borders=new THREE.LineSegments();borders.userData.earthRadius=1;
  let locale:'uk'|'en'='uk',available=true;
  const layer=createCountryLabels({index:{countries,byCode:new Map()},container,canvas,frame:new THREE.Group(),borders,camera:()=>camera,locale:()=>locale,available:()=>available});
  const labels=container.querySelectorAll('span');
  layer.tick();expect(labels[0].style.display).toBe('block');expect(labels[0].textContent).toBe('Країна');
  expect(labels[1].style.display).toBe('none');expect(labels[2].style.display).toBe('none');
  locale='en';layer.tick();expect(labels[0].textContent).toBe('Country');
  camera.position.copy(latLngToVector3(0,0,1.005));layer.tick();expect(labels[0].style.display).toBe('none');
  available=false;layer.tick();expect(container.firstElementChild?.hasAttribute('hidden')).toBe(true);
  layer.dispose();expect(container.children).toHaveLength(0);
});
