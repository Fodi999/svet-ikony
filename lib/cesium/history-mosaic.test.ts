import {expect,it} from 'vitest';
import * as C from '@cesium/engine';
import {isNicaeaPilot,mosaicHex} from './history-mosaic';
it('limits the pilot to a published located Nicaea event',()=>{
  const event={slug:'pershyi-vselenskyi-sobor',status:'published',latitude:40.4297,longitude:29.7231};
  expect(isNicaeaPilot(event)).toBe(true);
  expect(isNicaeaPilot({...event,status:'draft'})).toBe(false);
  expect(isNicaeaPilot({...event,latitude:NaN})).toBe(false);
  expect(isNicaeaPilot({...event,longitude:200})).toBe(false);
  expect(isNicaeaPilot(null)).toBe(false);
});
it('builds one closed six-sided marker on the ellipsoid',()=>{
  const ring=mosaicHex(29.7231,40.4297),center=C.Cartesian3.fromDegrees(29.7231,40.4297);
  expect(ring).toHaveLength(7);expect(ring[6]).toEqual(ring[0]);
  for(const point of ring){expect(C.Cartesian3.distance(center,point)).toBeCloseTo(700,1);expect(Math.abs(C.Cartographic.fromCartesian(point).height)).toBeLessThan(.01);}
});
