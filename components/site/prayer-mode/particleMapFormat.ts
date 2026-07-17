/**
 * The prayer-mode visualizer's data contract: a versioned binary particle map
 * produced entirely server-side (see `assistant/src/application/
 * prayer_visualizer.rs`). Backend does all preprocessing — image decode,
 * importance-weighted blue-noise sampling, color grading, per-particle
 * alpha/size/depth/reveal-order baking, gzip. The frontend only downloads
 * and parses this fixed layout into typed arrays ready for the GPU; it never
 * samples an image, computes a color/brightness, or generates a particle.
 */
export type ParticleMap = {
  count: number;
  /** xyz per particle, scattered start positions (pre-assembly). */
  starts: Float32Array;
  /** xyz per particle, image-traced target positions (post-assembly); z
   * carries the backend-baked depth band (background/subject/highlight). */
  targets: Float32Array;
  /** rgb per particle, 0..1, real sampled color already graded server-side. */
  colors: Float32Array;
  /** 0..1 per particle, baked opacity — higher for contours/face/highlights,
   * lower for flat fill dust. Defaults to 1 for maps older than format v2. */
  alphas: Float32Array;
  /** 0..1 per particle, baked relative point size (same importance signal as
   * alpha). Defaults to a neutral mid-value for maps older than format v2. */
  sizes: Float32Array;
  /** 0..1 per particle, when it should finish assembling relative to the
   * others: silhouette → face-region → detail → color fill → highlights.
   * Defaults to 0 (assemble together, no stagger) for maps older than v2. */
  reveal: Float32Array;
  /** one per particle, 0..1, used by the shader for phase/color variance. */
  randoms: Float32Array;
  /** Scene-space width/height of the assembled image, for camera framing. */
  width: number;
  height: number;
};

const HEADER_BYTES = 20;

/**
 * Decodes the "PVM1" binary format straight into a `ParticleMap`. This is a
 * header read plus a handful of typed-array views/copies — no image decoding
 * or per-pixel work in the browser. Supports the current format (v2, with
 * baked alpha/size/reveal) and gracefully degrades format v1 maps (no baked
 * channels yet) with neutral defaults, so a prayer that hasn't been
 * reprocessed since a version bump still renders instead of showing nothing.
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
 *   +  [v2 only] alphas  u8[count]
 *   +  [v2 only] sizes   u8[count]
 *   +  [v2 only] reveal  u8[count]
 *   +  randoms  u8[count]     (0..255)
 */
export function parseParticleMap(buffer: ArrayBuffer): ParticleMap | null {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const view = new DataView(buffer);

  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'PVM1') return null;

  const formatVersion = view.getUint16(4, true);
  const count = view.getUint32(8, true);
  const width = view.getFloat32(12, true);
  const height = view.getFloat32(16, true);
  if (!Number.isFinite(count) || count <= 0) return null;

  const targetsBytes = count * 3 * 4;
  const startsBytes = count * 3 * 4;
  const colorsBytes = count * 3;
  const bakedChannelBytes = formatVersion >= 2 ? count : 0;
  const randomsBytes = count;
  const expectedLength =
    HEADER_BYTES + targetsBytes + startsBytes + colorsBytes + bakedChannelBytes * 3 + randomsBytes;
  if (buffer.byteLength < expectedLength) return null;

  let offset = HEADER_BYTES;
  // Zero-copy views: both blocks start at a 4-byte-aligned offset (20, then
  // +targetsBytes which is itself a multiple of 4), which Float32Array requires.
  const targets = new Float32Array(buffer, offset, count * 3);
  offset += targetsBytes;
  const starts = new Float32Array(buffer, offset, count * 3);
  offset += startsBytes;
  const colorsU8 = new Uint8Array(buffer, offset, count * 3);
  offset += colorsBytes;

  let alphasU8: Uint8Array | null = null;
  let sizesU8: Uint8Array | null = null;
  let revealU8: Uint8Array | null = null;
  if (formatVersion >= 2) {
    alphasU8 = new Uint8Array(buffer, offset, count);
    offset += count;
    sizesU8 = new Uint8Array(buffer, offset, count);
    offset += count;
    revealU8 = new Uint8Array(buffer, offset, count);
    offset += count;
  }
  const randomsU8 = new Uint8Array(buffer, offset, count);

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < colorsU8.length; i++) colors[i] = colorsU8[i] / 255;
  const randoms = new Float32Array(count);
  for (let i = 0; i < randomsU8.length; i++) randoms[i] = randomsU8[i] / 255;

  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const reveal = new Float32Array(count);
  if (alphasU8 && sizesU8 && revealU8) {
    for (let i = 0; i < count; i++) alphas[i] = alphasU8[i] / 255;
    for (let i = 0; i < count; i++) sizes[i] = sizesU8[i] / 255;
    for (let i = 0; i < count; i++) reveal[i] = revealU8[i] / 255;
  } else {
    // Format v1 fallback: full opacity, neutral size, no reveal stagger.
    alphas.fill(1);
    sizes.fill(0.66);
    reveal.fill(0);
  }

  return { count, starts, targets, colors, alphas, sizes, reveal, randoms, width, height };
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
