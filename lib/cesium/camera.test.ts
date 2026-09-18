import {expect, it} from 'vitest';
import {terrainZoomDistance} from './camera';

it('uses clearance above the mountain rather than ellipsoid height', () => {
  expect(terrainZoomDistance('in', 4811, 4800)).toBe(1);
  expect(terrainZoomDistance('in', 4810, 4800)).toBe(0);
  expect(terrainZoomDistance('in', 4799, 4800)).toBe(0);
  expect(terrainZoomDistance('out', 4810, 4800)).toBe(10);
});
it('limits oblique steps by the picked terrain distance', () => {
  expect(terrainZoomDistance('in', 5000, 4000, 100)).toBe(35);
  expect(terrainZoomDistance('in', 10000, undefined)).toBe(3500);
  expect(terrainZoomDistance('in', NaN, 0)).toBe(0);
  expect(terrainZoomDistance('in', 100, NaN, Infinity)).toBe(35);
});
