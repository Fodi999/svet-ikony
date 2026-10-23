import {expect,it} from 'vitest';
import {ORBIT_PERIOD_MS,orbitHeading} from './orbit';
it('turns one full circle per period and wraps the heading',()=>{
  expect(orbitHeading(0,0)).toBe(0);
  expect(orbitHeading(0,ORBIT_PERIOD_MS/4)).toBeCloseTo(Math.PI/2);
  expect(orbitHeading(1,ORBIT_PERIOD_MS)).toBeCloseTo(1);
  expect(orbitHeading(-1,0)).toBeCloseTo(Math.PI*2-1);
});
