import {expect,it} from 'vitest';
import type * as Cesium from '@cesium/engine';
import {createEarthStreaming,earthStreamingEnabled,parseBasemap} from './earth-streaming';

type Layer={provider:string;show:boolean;isDestroyed:()=>boolean};
function fakeCesium(options:{googleFails?:boolean}={}){
  const calls:string[]=[];
  const layers:Layer[]=[];
  class ImageryLayer{provider:string;show=true;constructor(provider:string){this.provider=provider;}isDestroyed(){return false;}}
  class EllipsoidTerrainProvider{kind='ellipsoid';}
  const C={
    Ion:{defaultAccessToken:''},
    ImageryLayer,EllipsoidTerrainProvider,
    IonWorldImageryStyle:{AERIAL:2,ROAD:4},
    IonImageryProvider:{fromAssetId:async(id:number)=>{calls.push(`google:${id}`);if(options.googleFails)throw new Error('403');return `google-${id}`;}},
    createWorldImageryAsync:async({style}:{style:number})=>{calls.push(`bing:${style}`);return `bing-${style}`;},
    createWorldTerrainAsync:async()=>{calls.push('terrain');return {kind:'world'};},
    createOsmBuildingsAsync:async()=>{calls.push('buildings');return {show:true,destroy(){},isDestroyed:()=>false};},
  };
  const imagery={add(layer:Layer){layers.push(layer);},remove(){return true;}};
  const widget={isDestroyed:()=>false,canvas:{dataset:{} as Record<string,string>},scene:{imageryLayers:imagery,primitives:{add(){},remove(){}},terrainProvider:{kind:'initial'} as {kind:string},requestRender(){}}};
  const fallback={show:true} as unknown as Cesium.ImageryLayer;
  return {C:C as unknown as typeof Cesium,widget:widget as unknown as Cesium.CesiumWidget,raw:widget,fallback,calls,layers};
}

it('parses the basemap query and defaults to satellite',()=>{
  expect(parseBasemap('map')).toBe('map');
  expect(parseBasemap('satellite')).toBe('satellite');
  expect(parseBasemap(null)).toBe('satellite');
  expect(parseBasemap('bogus')).toBe('satellite');
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

it('switches Satellite and Map on one widget without recreating layers or the widget',async()=>{
  const env=fakeCesium();
  const earth=createEarthStreaming(env.C,env.widget,env.fallback);
  await earth.setBasemap('satellite');
  await earth.setBasemap('map');
  await earth.setBasemap('satellite');
  expect(env.layers.length).toBe(2);
  expect(env.layers.map(layer=>layer.show)).toEqual([true,false]);
  expect(env.calls.filter(call=>call.startsWith('google')).length).toBe(2);
  expect(env.fallback.show).toBe(false);
  expect(earth.state.provider).toBe('google-2d');
  expect(env.raw.canvas.dataset.earthBasemap).toBe('satellite');
});

it('falls back to Cesium World Imagery when Google Maps 2D is blocked by the ion account',async()=>{
  const env=fakeCesium({googleFails:true});
  const earth=createEarthStreaming(env.C,env.widget,env.fallback);
  await earth.setBasemap('map');
  expect(earth.state.googleBlocked).toBe(true);
  expect(earth.state.provider).toBe('cesium-world-imagery');
  expect(env.calls).toEqual(['google:3830184','bing:4']);
  await earth.setBasemap('satellite');
  expect(env.calls).toEqual(['google:3830184','bing:4','bing:2']);
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
