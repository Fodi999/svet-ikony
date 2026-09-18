import {expect, it} from 'vitest';
import {cesiumDataKey} from './delivery';
const release = 'a'.repeat(64);
it('allows only versioned imagery and native terrain', () => {
  for (const file of ['nasa/0/1/0.jpg','sentinel/13/8500/2000.png','alps-heightmap/layer.json','alps-quantized/13/8500/2000.terrain']) {
    expect(cesiumDataKey(release, file.split('/'))).toBe(`cesium/releases/${release}/data/${file}`);
  }
});
it('rejects traversal, scripts, source caches and unversioned keys', () => {
  for (const file of ['../secret','nasa/../0/1.jpg','nasa/0/1/0.js','source-cache/dem.tif','alps-heightmap/audit.json','nasa//0/0.jpg','nasa/0/0/0.jpg/extra']) {
    expect(cesiumDataKey(release, file.split('/'))).toBeNull();
  }
  expect(cesiumDataKey('latest',['alps-heightmap','layer.json'])).toBeNull();
});
