import { describe, expect, it } from 'vitest';
import { missingTexCoords, validateGlb } from './glb';
export function testGlb(data: object = { asset: { version: '2.0' } }): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(data));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const result = new ArrayBuffer(20 + paddedLength);
  const view = new DataView(result);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true);
  view.setUint32(12, paddedLength, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20).fill(32); new Uint8Array(result, 20, json.length).set(json);
  return result;
}
describe('GLB upload validation', () => {
  it('accepts a valid self-contained GLB v2', () => expect(() => validateGlb(testGlb())).not.toThrow());
  it('rejects arbitrary files and truncated data', () => {
    expect(() => validateGlb(new ArrayBuffer(10))).toThrow();
    expect(() => validateGlb(testGlb().slice(0, -4))).toThrow();
  });
  it('rejects external texture/resource requests', () => {
    expect(() => validateGlb(testGlb({ asset: { version: '2.0' }, images: [{ uri: 'https://other.example/texture.png' }] }))).toThrow(/Validation failed/);
  });
  it('flags a textured material on a primitive without UVs (Cesium shader crash)', () => {
    const data = { materials: [{ name: 'Trim', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ name: 'Fence', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }] };
    expect(missingTexCoords(data)).toEqual({ mesh: 'Fence', material: 'Trim', set: 0 });
    data.meshes[0].primitives[0].attributes = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 } as never;
    expect(missingTexCoords(data)).toBeNull();
  });
});
