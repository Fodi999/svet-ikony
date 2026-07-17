/**
 * The prayer-mode visualizer's data contract: a versioned binary particle map
 * produced entirely server-side (see `assistant/src/application/
 * prayer_visualizer.rs`). Backend does all preprocessing — image decode,
 * luminance/edge sampling, background culling, jitter, z-depth, per-device
 * particle counts, colors, grid scatter positions, gzip. The frontend only
 * downloads and parses this fixed layout into typed arrays ready for the GPU;
 * it never samples an image, computes a color, or generates a particle.
 */
export type ParticleMap = {
  count: number;
  /** xyz per particle, scattered grid-start positions (pre-assembly). */
  starts: Float32Array;
  /** xyz per particle, image-traced target positions (post-assembly). */
  targets: Float32Array;
  /** rgb per particle, 0..1, already color-graded server-side. */
  colors: Float32Array;
  /** one per particle, 0..1, used by the shader for phase/color variance. */
  randoms: Float32Array;
  /** Scene-space width/height of the assembled image, for camera framing. */
  width: number;
  height: number;
};

/**
 * Decodes the "PVM1" binary format straight into a `ParticleMap`. This is a
 * header read plus a handful of typed-array views/copies — no image decoding
 * or per-pixel work in the browser.
 *
 * Layout (all little-endian):
 *   0  magic "PVM1"            (4 bytes)
 *   4  format version  u16
 *   6  reserved         u16
 *   8  particle count   u32
 *  12  width             f32
 *  16  height            f32
 *  20  targets  f32[count*3]
 *   +  starts   f32[count*3]
 *   +  colors   u8[count*3]   (0..255 per channel)
 *   +  randoms  u8[count]     (0..255)
 */
export function parseParticleMap(buffer: ArrayBuffer): ParticleMap | null {
  if (buffer.byteLength < 20) return null;
  const view = new DataView(buffer);

  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'PVM1') return null;

  const count = view.getUint32(8, true);
  const width = view.getFloat32(12, true);
  const height = view.getFloat32(16, true);
  if (!Number.isFinite(count) || count <= 0) return null;

  const targetsBytes = count * 3 * 4;
  const startsBytes = count * 3 * 4;
  const colorsBytes = count * 3;
  const randomsBytes = count;
  const expectedLength = 20 + targetsBytes + startsBytes + colorsBytes + randomsBytes;
  if (buffer.byteLength < expectedLength) return null;

  let offset = 20;
  // Zero-copy views: both blocks start at a 4-byte-aligned offset (20, then
  // +targetsBytes which is itself a multiple of 4), which Float32Array requires.
  const targets = new Float32Array(buffer, offset, count * 3);
  offset += targetsBytes;
  const starts = new Float32Array(buffer, offset, count * 3);
  offset += startsBytes;
  const colorsU8 = new Uint8Array(buffer, offset, count * 3);
  offset += colorsBytes;
  const randomsU8 = new Uint8Array(buffer, offset, count);

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < colorsU8.length; i++) colors[i] = colorsU8[i] / 255;
  const randoms = new Float32Array(count);
  for (let i = 0; i < randomsU8.length; i++) randoms[i] = randomsU8[i] / 255;

  return { count, starts, targets, colors, randoms, width, height };
}

/**
 * Fetches and decodes a particle map URL. The server sends the file
 * gzip-encoded (`Content-Encoding: gzip`), which `fetch` decompresses
 * transparently — `arrayBuffer()` already returns the raw decoded bytes.
 */
export async function loadParticleMap(url: string): Promise<ParticleMap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return parseParticleMap(buffer);
  } catch {
    return null;
  }
}
