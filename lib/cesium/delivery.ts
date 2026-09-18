export function cesiumDataKey(release: string, segments: string[]): string | null {
  if (!/^[a-f0-9]{64}$/.test(release)) return null;
  const path = segments.join('/');
  const tile = '(?:0|[1-9][0-9]{0,5})';
  const imagery = new RegExp(`^(?:nasa/${tile}/${tile}/${tile}\\.jpg|sentinel/${tile}/${tile}/${tile}\\.png)$`);
  const terrain = new RegExp(`^alps-(?:heightmap|quantized)/(?:layer\\.json|${tile}/${tile}/${tile}\\.terrain)$`);
  if (!imagery.test(path) && !terrain.test(path)) return null;
  return `cesium/releases/${release}/data/${path}`;
}
