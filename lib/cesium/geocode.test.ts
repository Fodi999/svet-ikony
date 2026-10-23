import {expect,it} from 'vitest';
import type * as C from '@cesium/engine';
import {geocodePlaces} from './geocode';
it('does not call the geocoder for short queries',async()=>{
  expect(await geocodePlaces({} as C.CesiumWidget,' Ки ')).toEqual([]);
});
