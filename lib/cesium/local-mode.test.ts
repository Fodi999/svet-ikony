import {expect,it} from 'vitest';
import {resolveHistoryExperience,resolveVisualizerEngine} from './local-mode';
it('enables Cesium only for explicit loopback development',()=>{
  expect(resolveVisualizerEngine('development','localhost:3001','cesium')).toBe('cesium');
  expect(resolveVisualizerEngine('development','[::1]:3001','cesium')).toBe('cesium');
  for(const env of ['production','test',undefined]) expect(resolveVisualizerEngine(env,'localhost','cesium')).toBe('three');
  expect(resolveVisualizerEngine('development','svetikony.com','cesium')).toBe('three');
  expect(resolveVisualizerEngine('development','localhost.evil.test','cesium')).toBe('three');
  expect(resolveVisualizerEngine('development','localhost')).toBe('three');
});
it('opens the Cesium calendar globe by default and keeps Three.js as an explicit rollback',()=>{
  expect(resolveHistoryExperience({})).toBe('cesium-calendar');
  expect(resolveHistoryExperience({engine:'cesium'})).toBe('cesium-calendar');
  expect(resolveHistoryExperience({engine:'unknown'})).toBe('cesium-calendar');
  expect(resolveHistoryExperience({engine:'three'})).toBe('legacy');
  expect(resolveHistoryExperience({view:'legacy'})).toBe('legacy');
});
