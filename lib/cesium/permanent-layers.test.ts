import {expect,it} from 'vitest';
import {initialLayers,layersForMode,defaultLayers,globeModes,restoreLayers} from './unified';
it('respects explicit permanent layer exclusions in map URLs',()=>{
 expect(initialLayers(new URLSearchParams('mode=globe&layers=countries,borders'))).toMatchObject({christianPlaces:false,saints:false,churches:false,monasteries:false,calendar:false});
});
it('restores saved false values and defaults only missing or invalid values',()=>{
 expect(restoreLayers(new URLSearchParams('mode=globe'),{saints:false,churches:false,cities:'false',borders:null})).toEqual({...defaultLayers,saints:false,churches:false});
 for(const invalid of [null,[],false,'broken'])expect(restoreLayers(new URLSearchParams('mode=globe'),invalid)).toEqual(defaultLayers);
});
it('gives explicit shared URL layers priority over storage',()=>{
 expect(restoreLayers(new URLSearchParams('layers='),defaultLayers)).toEqual(Object.fromEntries(Object.keys(defaultLayers).map(key=>[key,false])));
});
it('keeps disabled permanent layers across date modes and locale-independent restoration',()=>{
 const saved={...defaultLayers,christianPlaces:false,saints:false,churches:false,monasteries:false};
 for(const mode of globeModes){
  const changed=layersForMode(saved,mode);
  expect(changed).toMatchObject({christianPlaces:false,saints:false,churches:false,monasteries:false});
  expect(restoreLayers(new URLSearchParams(`mode=${mode}&date=2026-12-17`),JSON.parse(JSON.stringify(changed)))).toEqual(changed);
 }
});
it('keeps permanent objects through every mode and isolates calendar events',()=>{
 for(const mode of globeModes)expect(layersForMode(defaultLayers,mode)).toMatchObject({christianPlaces:true,saints:true,churches:true,monasteries:true,calendar:mode==='calendar'});
});
