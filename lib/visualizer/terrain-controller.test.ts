import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fixture } from '../terrain/test-support';
const io=vi.hoisted(()=>({manifest:vi.fn(),level:vi.fn(),unload:vi.fn(),root:null as THREE.Group|null}));
vi.mock('./terrain-loader',()=>({TerrainLoader:class{loadTerrainManifest=io.manifest;loadTerrainLevel=io.level;unloadTerrainLevel=io.unload;}}));
vi.mock('./terrain-stream',()=>({TerrainStream:class{
 root=io.root!;ready=false;failed:string[]=[];selector={invalidate(){}};
 constructor(_manifest:unknown,_radius:number,_mobile:boolean,prepare:(root:THREE.Group)=>Promise<unknown>){void io.level().then(()=>prepare(this.root)).then(()=>{this.ready=true;});}
 update(){}setBorders(){}dispose(){io.unload();}
 get stats(){return{loaded:1,visible:Number(this.root.visible),cached:0,bytes:100,networkBytes:100,networkRequests:1,cacheHits:0,distance:3,evaluations:1,states:'READY'};}
}}));
vi.mock('./country-camera',()=>({animateCountryCamera:vi.fn(()=>()=>{})}));
import { createTerrainController } from './terrain-controller';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
async function setup(mobile=false){
 const {manifest}=await fixture();manifest.anchors=[];const root=new THREE.Group();io.root=root;io.manifest.mockResolvedValue({...manifest,sourceUrl:'http://localhost:3000/terrain/test/L1/manifest.json'});io.level.mockResolvedValue(root);
 vi.stubGlobal('navigator',{hardwareConcurrency:8,deviceMemory:8});vi.stubGlobal('window',{matchMedia:()=>({matches:mobile})});
 const camera=new THREE.PerspectiveCamera(45,1,0.1,100);camera.position.set(0,0,3);const borders=new THREE.LineSegments();borders.userData.earthRadius=1.8;
 const controls={minDistance:3,maxDistance:10,maxZoom:5,target:new THREE.Vector3(),domElement:null} as unknown as OrbitControls;
 const notify=vi.fn(),flying=vi.fn(()=>false),prepare=vi.fn(async()=>{}),earth=new THREE.Group();const material=new THREE.MeshBasicMaterial({color:0xeeeeee});earth.add(new THREE.Mesh(new THREE.SphereGeometry(),material));
 const controller=createTerrainController({prepare,frame:new THREE.Group(),earth,borders,controls,camera:()=>camera,ready:()=>true,flying,cancelFly:vi.fn(),reducedMotion:()=>false,notify});
 return{controller,notify,flying,camera,controls,prepare,material,root};
}
describe('terrain view transitions',()=>{
 it('does not load from idle/other countries and waits for fly-to plus shader preparation',async()=>{
  const s=await setup();s.controller.tick(0.05);s.controller.select('PL');s.controller.tick(0.05);expect(io.manifest).not.toHaveBeenCalled();
  s.flying.mockReturnValue(true);s.controller.select('UA');s.controller.tick(0.05);await vi.waitFor(()=>expect(s.prepare).toHaveBeenCalledOnce());s.controller.tick(0.05);expect(s.notify.mock.lastCall?.[0].viewLevel).toBe('GLOBE');s.flying.mockReturnValue(false);s.controller.tick(0.05);expect(s.notify.mock.lastCall?.[0].viewLevel).toBe('REGION_L1');expect(s.camera.near).toBeLessThan(0.1);s.controller.dispose();
 });
 it('restores Earth, camera limits and GLOBE; second entry reuses the same loaded root',async()=>{
  const s=await setup(),color=s.material.color.clone();s.controller.select('UA');s.controller.tick(0.05);await vi.waitFor(()=>expect(s.prepare).toHaveBeenCalledOnce());for(let i=0;i<20;i++)s.controller.tick(0.05);
  const camera=s.camera;s.controller.back(false);for(let i=0;i<20;i++)s.controller.tick(0.05);expect(s.notify.mock.lastCall?.[0].viewLevel).toBe('GLOBE');expect(s.root.visible).toBe(false);expect(s.material.color.equals(color)).toBe(true);expect(s.controls.minDistance).toBe(3);expect(s.camera.near).toBe(0.1);
  s.controller.select('UA',true);s.controller.tick(0.05);expect(s.notify.mock.lastCall?.[0].viewLevel).toBe('REGION_L1');expect(io.level).toHaveBeenCalledOnce();expect(s.camera).toBe(camera);s.controller.dispose();
 });
 it('requires a user zoom gesture on mobile after selecting UA',async()=>{
  const s=await setup(true);s.controller.select('UA');s.controller.tick(0.05);expect(io.manifest).not.toHaveBeenCalled();s.controller.userZoom();s.controller.tick(0.05);await vi.waitFor(()=>expect(io.manifest).toHaveBeenCalledOnce());s.controller.dispose();
 });
 it('keeps the globe on manifest failure without retrying every frame',async()=>{
  const s=await setup();vi.spyOn(console,'warn').mockImplementation(()=>{});io.manifest.mockRejectedValue(new Error('offline'));s.controller.select('UA');s.controller.tick(0.05);await vi.waitFor(()=>expect(s.notify.mock.lastCall?.[0].error).toBe(true));for(let i=0;i<20;i++)s.controller.tick(0.05);expect(io.manifest).toHaveBeenCalledOnce();expect(s.notify.mock.lastCall?.[0].viewLevel).toBe('GLOBE');s.controller.dispose();vi.restoreAllMocks();
 });
});
