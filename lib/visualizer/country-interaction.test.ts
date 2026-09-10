// @vitest-environment jsdom
import fs from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { prepareCountryIndex } from './countries';
import { createCountryInteraction, countryTooltipPosition } from './country-interaction';
import { countryMessages } from './country-messages';
import { latLngToVector3 } from './geography';

const index = prepareCountryIndex(JSON.parse(fs.readFileSync('public/data/country-borders-50m.geojson', 'utf8')));
let now = 0, sequence = 0;
let frames: Map<number, FrameRequestCallback>;
let cleanup: (() => void) | undefined;
beforeEach(() => {
  now = 0; sequence = 0; frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function flush(time: number) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time)); }
function setup() {
  const canvas = document.createElement('canvas'), tooltip = document.createElement('div'), debug = document.createElement('output');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({left:0,top:0,width:100,height:100} as DOMRect);
  const frame = new THREE.Group(), pins = new THREE.Group(), borders = new THREE.LineSegments();
  borders.userData.earthRadius = 1;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1,64,48), new THREE.MeshBasicMaterial());
  const camera = new THREE.PerspectiveCamera(45,1,.1,100);
  camera.position.copy(latLngToVector3(49,32,3)); camera.lookAt(0,0,0);
  const controls = {target:new THREE.Vector3(),enabled:true,minDistance:2,maxDistance:10,minZoom:.5,maxZoom:5,update:vi.fn()} as unknown as OrbitControls;
  const select = vi.fn(), transitioning = vi.fn();
  let locale: 'uk'|'ru'|'en' = 'uk';
  const interaction = createCountryInteraction({canvas,tooltip,debug,index,frame,pins,borders,controls,camera:()=>camera,overview:()=>camera.clone(),surface:()=>earth,locale:()=> locale,hint:()=> countryMessages[locale].open,selected:()=>null,onSelect:select,transitioning,available:()=>true,reducedMotion:()=>false});
  cleanup = () => { interaction.dispose(); earth.geometry.dispose(); earth.material.dispose(); };
  function pointer(type:string,x=50,y=50,id=1,pointerType='mouse',button=0) {
    const event = new MouseEvent(type,{clientX:x,clientY:y,bubbles:true,button});
    Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType}});
    canvas.dispatchEvent(event);
  }
  return {canvas,tooltip,frame,borders,controls,select,interaction,pointer,camera,setLocale:(next:typeof locale)=>{locale=next;interaction.refreshTooltip();}};
}
describe('country pointer lifecycle', () => {
  it('updates a stationary tooltip in three languages without changing selection, camera or GPU layer', () => {
    const s = setup(); s.interaction.setSelectedCountry('UA'); flush(1000);
    s.pointer('pointermove'); flush(1030);
    const layer = s.frame.children[0], position = s.camera.position.clone();
    expect(s.tooltip.textContent).toContain('Україна');
    for (const [locale,name,hint] of [['en','Ukraine','Click to open'],['ru','Украина','Нажмите, чтобы открыть'],['uk','Україна','Натисніть, щоб відкрити']] as const) {
      s.setLocale(locale); s.interaction.setSelectedCountry('UA');
      expect(s.tooltip.textContent).toContain(name); expect(s.tooltip.textContent).toContain(hint);
      expect(s.frame.children[0]).toBe(layer); expect(layer.visible).toBe(true);
      expect(s.camera.position.equals(position)).toBe(true); expect(frames.size).toBe(0);
    }
  });
  it('keeps the grabbing cursor during small pressed moves and ignores secondary clicks', () => {
    const s = setup(); s.pointer('pointerdown'); s.pointer('pointermove',52); flush(30);
    expect(s.canvas.style.cursor).toBe('grabbing'); expect(s.tooltip.hidden).toBe(true);
    s.pointer('pointercancel');
    s.pointer('pointerdown',50,50,1,'mouse',2); s.pointer('pointerup',50,50,1,'mouse',2);
    expect(s.select).not.toHaveBeenCalled();
  });
  it('detects hover on demand and recalculates after wheel without a permanent detection loop', () => {
    const s = setup(); s.pointer('pointermove'); flush(30);
    expect(s.tooltip.textContent).toContain('Україна'); expect(s.tooltip.hidden).toBe(false);
    expect(s.canvas.style.cursor).toBe('pointer'); expect(frames.size).toBe(0);
    s.canvas.dispatchEvent(new WheelEvent('wheel')); flush(60);
    expect(s.tooltip.hidden).toBe(false); expect(frames.size).toBe(0);
    s.pointer('pointerleave'); expect(s.tooltip.hidden).toBe(true);
  });
  it('selects a click, but suppresses drag and multi-touch pinch releases', () => {
    const s = setup(); s.pointer('pointerdown'); s.pointer('pointerup');
    expect(s.select).toHaveBeenCalledWith('UA'); s.select.mockClear();
    s.pointer('pointerdown'); s.pointer('pointermove',70); s.pointer('pointerup',50);
    expect(s.select).not.toHaveBeenCalled();
    s.pointer('pointerdown',50,50,1,'touch'); s.pointer('pointerdown',55,50,2,'touch');
    s.pointer('pointerup',50,50,1,'touch'); s.pointer('pointerup',55,50,2,'touch');
    expect(s.select).not.toHaveBeenCalled();
    s.pointer('pointermove'); flush(30);
    expect(s.tooltip.hidden).toBe(false); // Hybrid tablet: mouse hover recovers after pinch.
    s.pointer('pointerdown',50,50,1,'touch'); s.pointer('pointerup',50,50,1,'touch');
    expect(s.select).toHaveBeenCalledWith('UA');
  });
  it('keeps selection when borders are off, cancels fly-to on drag, and disposes its resources', () => {
    const s = setup(); s.borders.visible = false; s.interaction.setSelectedCountry('UA');
    expect(s.frame.children.some(child=>child.visible)).toBe(true);
    expect(s.controls.enabled).toBe(false); flush(500);
    s.pointer('pointerdown'); expect(s.controls.enabled).toBe(true);
    s.pointer('pointercancel'); s.interaction.reset(); flush(1600);
    expect(s.frame.children.every(child=>!child.visible)).toBe(true);
    expect(s.controls.enabled).toBe(true);
    s.interaction.dispose(); expect(s.frame.children).toHaveLength(0); expect(frames.size).toBe(0);
    s.pointer('pointerdown'); s.pointer('pointerup'); expect(s.select).not.toHaveBeenCalled();
  });
});

describe('tooltip edge placement', () => {
  it.each([[0,0],[390,0],[390,250],[0,250],[195,125]])('keeps a long translated label inside the scene at %s/%s', (x,y) => {
    const result = countryTooltipPosition({x,y},{width:390,height:250},{width:240,height:80});
    expect(result.left).toBeGreaterThanOrEqual(8); expect(result.left+240).toBeLessThanOrEqual(382);
    expect(result.top).toBeGreaterThanOrEqual(8); expect(result.top+80).toBeLessThanOrEqual(242);
  });
  it('flips below the pointer when there is no space above', () => {
    expect(countryTooltipPosition({x:100,y:10},{width:300,height:300},{width:150,height:65}).placement).toBe('below');
    expect(countryTooltipPosition({x:100,y:200},{width:300,height:300},{width:150,height:65}).placement).toBe('above');
  });
});
