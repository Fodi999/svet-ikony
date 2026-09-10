import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fixture } from '../terrain/test-support';
import { terrainRootMatrix, terrainPoint, terrainAnchorErrors } from './terrain-alignment';
import { terrainAllowed } from './terrain-state';
import { applyTerrainProjection, projectTerrainPoint } from './terrain-projection';
const parse = vi.hoisted(()=>vi.fn());
vi.mock('three/addons/loaders/GLTFLoader.js',()=>({GLTFLoader:class{parseAsync=parse;}}));
import { TerrainLoader, loadTerrainTile, type LoadedManifest } from './terrain-loader';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('terrain frontend integrity and lifecycle',()=>{
 it('rejects MIME and byte tampering before GLTF decode',async()=>{
  const f=await fixture(),m={...f.manifest,sourceUrl:'http://localhost:3000/terrain/test/L1/manifest.json'};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(f.bytes,{headers:{'content-type':'text/html'}})));
  await expect(loadTerrainTile(m.tiles[0],m)).rejects.toThrow('MIME');expect(parse).not.toHaveBeenCalled();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(40),{headers:{'content-type':'model/gltf-binary'}})));
  await expect(loadTerrainTile(m.tiles[0],m)).rejects.toThrow('integrity');expect(parse).not.toHaveBeenCalled();
 });
 it('loads once, applies declared transforms and disposes on unload',async()=>{
  const f=await fixture(),m={...f.manifest,sourceUrl:'http://localhost:3000/terrain/test/L1/manifest.json'};
  const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());group.add(mesh);
  const dispose=vi.spyOn(mesh.geometry,'dispose');parse.mockResolvedValue({scene:group});
  const fetch=vi.fn().mockImplementation(async()=>new Response(f.bytes,{headers:{'content-type':'model/gltf-binary'}}));vi.stubGlobal('fetch',fetch);
  const loader=new TerrainLoader(vi.fn());const root=await loader.loadTerrainLevel(m);expect(await loader.loadTerrainLevel(m)).toBe(root);expect(fetch).toHaveBeenCalledOnce();expect(root.children[0].position.toArray()).toEqual([0,0,0]);loader.unloadTerrainLevel();expect(dispose).toHaveBeenCalledOnce();
 });
 it('does not return a partial level and disposes earlier tiles on failure',async()=>{
  const f=await fixture(),m={...f.manifest,sourceUrl:'http://localhost:3000/terrain/test/L1/manifest.json'};
  m.tiles=[m.tiles[0],{...m.tiles[0],tile_id:'l1_1_0',file:'1_0.glb'}];
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),group=new THREE.Group();group.add(mesh);parse.mockResolvedValue({scene:group});const dispose=vi.spyOn(mesh.geometry,'dispose');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(f.bytes,{headers:{'content-type':'model/gltf-binary'}})).mockRejectedValueOnce(new Error('offline')));
  const progress=vi.fn(),loader=new TerrainLoader(progress);await expect(loader.loadTerrainLevel(m)).rejects.toThrow('offline');expect(dispose).toHaveBeenCalledOnce();expect(progress.mock.lastCall?.[0].failed).toEqual(['l1_1_0']);
 });
 it('disposes a decode which completes after cancellation',async()=>{
  const f=await fixture(),m={...f.manifest,sourceUrl:'http://localhost:3000/terrain/test/L1/manifest.json'};
  const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());group.add(mesh);const dispose=vi.spyOn(mesh.geometry,'dispose');const abort=new AbortController();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(f.bytes,{headers:{'content-type':'model/gltf-binary'}})));parse.mockImplementation(async()=>{abort.abort();return{scene:group};});
  await expect(loadTerrainTile(m.tiles[0],m,abort.signal)).rejects.toThrow();expect(dispose).toHaveBeenCalledOnce();
 });
});
describe('terrain geography and mobile',()=>{
 it('maps the AEQD origin to the globe surface with east/up/south orientation',async()=>{
  const {manifest}=await fixture();const center=new THREE.Vector3(2,3,4),matrix=terrainRootMatrix(manifest,1.8,center);const origin=terrainPoint(manifest,43,24).applyMatrix4(matrix);expect(origin.distanceTo(center)).toBeCloseTo(1.8,8);expect(matrix.determinant()).toBeGreaterThan(0);
  const east=terrainPoint(manifest,43,24.001).applyMatrix4(matrix).sub(origin);expect(east.x).toBeGreaterThan(0);expect(east.z).toBeLessThan(0);
 });
 it('aligns four anchors with the shared root projection without individual tile offsets',async()=>{
  const {manifest}=await fixture();(manifest.coordinateSystem as {origin:unknown}).origin={latitude:48.5,longitude:31};manifest.anchors=[{id:'Kyiv',latitude:50.4501,longitude:30.5234},{id:'Lviv',latitude:49.8397,longitude:24.0297},{id:'Odesa',latitude:46.4825,longitude:30.7233},{id:'Kharkiv',latitude:49.9935,longitude:36.2304}];
  const errors=terrainAnchorErrors(manifest,1.8,new THREE.Vector3());expect(errors).toHaveLength(4);expect(Math.max(...errors.map(x=>x.meters))).toBeLessThan(0.2);
 });
 it('requires close zoom on mobile and rejects weak devices/save data/memory pressure',()=>{
  expect(terrainAllowed({mobile:true},false)).toBe(false);expect(terrainAllowed({mobile:true,memory:8,cores:8},true)).toBe(true);expect(terrainAllowed({mobile:false,memory:2},true)).toBe(false);expect(terrainAllowed({mobile:false,saveData:true},true)).toBe(false);expect(terrainAllowed({mobile:false,usedHeap:80,heapLimit:100},true)).toBe(false);
 });
});


describe('shared shader projection',()=>{
 it('uses glTF north-to-south UV rows so feathering never affects internal tile edges',async()=>{
  const {manifest}=await fixture();manifest.grid.countY=3;manifest.tiles[0].y=0;
  const root=new THREE.Group(),tile=new THREE.Group(),material=new THREE.MeshStandardMaterial();tile.name=manifest.tiles[0].tile_id;tile.add(new THREE.Mesh(new THREE.PlaneGeometry(),material));root.add(tile);applyTerrainProjection(root,manifest);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <uv_vertex>\n#include <begin_vertex>\n#include <beginnormal_vertex>',fragmentShader:'#include <common>\n#include <dithering_fragment>'} as unknown as Parameters<typeof material.onBeforeCompile>[0];material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  expect(shader.uniforms.terrainTile.value.y).toBe(0);expect(shader.uniforms.terrainGrid.value.y).toBe(3);expect(material.forceSinglePass).toBe(true);expect(tile.children[0].renderOrder).toBe(-1);
 });
 it('keeps exaggerated height radial while preserving the geographic angle',()=>{
  const r=63.71,c=0.15,h=0.28;const source=new THREE.Vector3(r*c,r*(Math.cos(c)-1)+h,0),p=projectTerrainPoint(source,r).add(new THREE.Vector3(0,r,0));expect(p.length()).toBeCloseTo(r+h,8);expect(Math.atan2(p.x,p.y)).toBeCloseTo(c,10);expect(source.x).toBe(r*c);
 });
});
