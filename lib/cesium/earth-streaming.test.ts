import {expect,it} from 'vitest';
import type * as Cesium from '@cesium/engine';
import {createEarthStreaming,earthStreamingEnabled,parseBasemap} from './earth-streaming';

type Layer={provider:string;show:boolean;isDestroyed:()=>boolean};
function fakeCesium(){
  const calls:string[]=[];
  const layers:Layer[]=[];
  class ImageryLayer{provider:string;show=true;constructor(provider:string){this.provider=provider;}isDestroyed(){return false;}}
  class EllipsoidTerrainProvider{kind='ellipsoid';}
  const C={
    Ion:{defaultAccessToken:''},
    ImageryLayer,EllipsoidTerrainProvider,
    IonWorldImageryStyle:{AERIAL:2,AERIAL_WITH_LABELS:3,ROAD:4},
    createWorldImageryAsync:async({style}:{style:number})=>{calls.push(`world-imagery:${style}`);return `world-imagery-${style}`;},
    createWorldTerrainAsync:async()=>{calls.push('terrain');return {kind:'world'};},
    createOsmBuildingsAsync:async()=>{calls.push('buildings');return {show:true,destroy(){},isDestroyed:()=>false};},
  };
  const imagery={add(layer:Layer){layers.push(layer);},remove(){return true;}};
  const widget={isDestroyed:()=>false,canvas:{dataset:{} as Record<string,string>},scene:{imageryLayers:imagery,primitives:{add(){},remove(){}},terrainProvider:{kind:'initial'} as {kind:string},requestRender(){}}};
  const fallback={show:true} as unknown as Cesium.ImageryLayer;
  return {C:C as unknown as typeof Cesium,widget:widget as unknown as Cesium.CesiumWidget,raw:widget,fallback,calls,layers};
}

it('parses the basemap query and defaults to satellite',()=>{
  expect(parseBasemap('satellite')).toBe('satellite');
  expect(parseBasemap('streets')).toBe('streets');
  expect(parseBasemap(null)).toBe('satellite');
  expect(parseBasemap('bogus')).toBe('satellite');
});

it('migrates legacy Google-era basemap values so old links/localStorage never resurrect Google imagery',()=>{
  expect(parseBasemap('google')).toBe('satellite');
  expect(parseBasemap('cesium')).toBe('satellite');
  expect(parseBasemap('map')).toBe('streets');
  expect(parseBasemap('google-streets')).toBe('streets');
  expect(parseBasemap('hybrid')).toBe('streets');
  expect(parseBasemap('overlay')).toBe('streets');
});

it('keeps the legacy NASA path unless a token is configured or in development',()=>{
  const original=process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  delete process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  // vitest runs with NODE_ENV=test: no token means no ion requests.
  expect(earthStreamingEnabled('')).toBe(false);
  process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN='token-from-env';
  expect(earthStreamingEnabled('')).toBe(true);
  if(original===undefined)delete process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;else process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN=original;
});

it('switches Satellite and Satellite+Streets on one widget without recreating layers or the widget, using Cesium World Imagery only',async()=>{
  const env=fakeCesium();
  const earth=createEarthStreaming(env.C,env.widget,env.fallback);
  await earth.setBasemap('satellite');
  await earth.setBasemap('streets');
  await earth.setBasemap('satellite');
  expect(env.layers.length).toBe(2);
  expect(env.layers.map(layer=>layer.show)).toEqual([true,false]);
  // AERIAL (2) for satellite, AERIAL_WITH_LABELS (3) for streets -- each built exactly once and reused.
  expect(env.calls).toEqual(['world-imagery:2','world-imagery:3']);
  expect(env.fallback.show).toBe(false);
  expect(earth.state.provider).toBe('cesium-world-imagery');
  expect(env.raw.canvas.dataset.earthBasemap).toBe('satellite');
});

it('falls back to the NASA layer if Cesium World Imagery fails to load, never to Google',async()=>{
  const env=fakeCesium();
  env.C.createWorldImageryAsync=async()=>{throw new Error('network');};
  const earth=createEarthStreaming(env.C,env.widget,env.fallback);
  await earth.setBasemap('satellite');
  expect(env.fallback.show).toBe(true);
  expect(earth.state.error).toContain('imagery');
});

it('toggles World Terrain and needs it for OSM Buildings',async()=>{
  const env=fakeCesium();
  const earth=createEarthStreaming(env.C,env.widget,env.fallback);
  await earth.setTerrain(true);
  expect(env.raw.scene.terrainProvider.kind).toBe('world');
  await earth.setTerrain(false);
  expect(env.raw.scene.terrainProvider.kind).toBe('ellipsoid');
  await earth.setBuildings(true);
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(earth.state.buildings).toBe(true);
  expect(earth.state.terrain).toBe(true);
  await earth.setBuildings(false);
  expect(earth.state.buildings).toBe(false);
});
