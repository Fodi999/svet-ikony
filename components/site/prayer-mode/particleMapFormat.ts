/**
 * The prayer-mode visualizer's data contract: a versioned binary particle map
 * produced entirely server-side (see `assistant/src/application/
 * prayer_visualizer.rs`). Backend does all preprocessing — image decode,
 * importance-weighted blue-noise sampling, auto-detected color grading,
 * auto exposure/shadow-lift, per-particle alpha/size/depth/reveal-order/
 * shape baking. Nothing is admin-configured: particle count, base point
 * size, exposure, and every particle's render shape are all derived from
 * the image itself and baked into this map. The frontend only downloads
 * and parses this fixed layout into typed arrays ready for the GPU; it
 * never samples an image, computes a color/brightness, or generates or
 * classifies a particle.
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
  /** 0, 1, or 2 per particle — the hybrid render family: 0 = soft round
   * "splat" (volume fill), 1 = small sharp "point" (fine detail/highlight),
   * 2 = elongated "streak" (hair/fold/contour). Format v4+; defaults to 0
   * (splat) for older maps, which renders as a uniform soft dot field. */
  shapes: Float32Array;
  /** Elongation for streak particles, ~1.0 (round) to ~6.0 (long streak);
   * 1.0 for splats/points. Format v4+; defaults to 1.0. */
  aspects: Float32Array;
  /** Orientation of the elongated axis, radians — the edge-tangent
   * direction for streaks. Format v4+; defaults to 0. */
  rotations: Float32Array;
  /** 0..1 falloff softness — higher reads as a softer, wider glow (splats),
   * lower as a crisp core (points). Format v4+; defaults to 0.5 (matches
   * the pre-v4 uniform circular falloff). */
  softness: Float32Array;
  /** 0..1 extra additive bloom strength layered on top of alpha — strongest
   * on highlight points, weakest on flat-fill splats. Format v4+; defaults
   * to 0.2. */
  glow: Float32Array;
  /** one per particle, 0..1, used by the shader for phase/color variance. */
  randoms: Float32Array;
  /** Scene-space width/height of the assembled image, for camera framing. */
  width: number;
  height: number;
  /** Auto-derived base point size for this tier (denser tiers get smaller
   * points) — the renderer's uPointSize base value. Format v3+; defaults to
   * a neutral 2.0 for older maps. */
  basePointSize: number;
  /** Auto-derived exposure multiplier from the image's overall luminance —
   * the renderer's uExposure value. Format v3+; defaults to a neutral 1.6
   * for older maps. */
  autoExposure: number;
};

const HEADER_BYTES_V1V2 = 20;
const HEADER_BYTES_V3 = 28;
const TAU = Math.PI * 2;

/**
 * Decodes the "PVM1" binary format straight into a `ParticleMap`. This is a
 * header read plus a handful of typed-array views/copies — no image decoding
 * or per-pixel work in the browser. Supports the current format (v4, with
 * baked hybrid-shape channels) and gracefully degrades older maps (v3: no
 * shape/aspect/rotation/softness/glow; v2: also no header size/exposure; v1:
 * none of the above) with neutral defaults, so a prayer that hasn't been
 * reprocessed since a version bump still renders instead of showing nothing.
 *
 * Layout (all little-endian):
 *   0  magic "PVM1"              (4 bytes)
 *   4  format version  u16
 *   6  reserved         u16
 *   8  particle count   u32
 *  12  width             f32
 *  16  height            f32
 *  20  [v3+] basePointSize f32
 *  24  [v3+] autoExposure  f32
 *  20|28  targets  f32[count*3]
 *      +  starts   f32[count*3]
 *      +  colors   u8[count*3]   (0..255 per channel)
 *      +  [v2+] alphas  u8[count]
 *      +  [v2+] sizes   u8[count]
 *      +  [v2+] reveal  u8[count]
 *      +  [v4+] shapes    u8[count]  (0=splat, 1=point, 2=streak)
 *      +  [v4+] aspects   u8[count]  (0..255 over [1.0, 6.0])
 *      +  [v4+] rotations u8[count]  (0..255 over [0, 2π))
 *      +  [v4+] softness  u8[count]  (0..255 over [0, 1])
 *      +  [v4+] glow      u8[count]  (0..255 over [0, 1])
 *      +  randoms  u8[count]     (0..255)
 */
export function parseParticleMap(buffer: ArrayBuffer): ParticleMap | null {
  if (buffer.byteLength < HEADER_BYTES_V1V2) return null;
  const view = new DataView(buffer);

  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'PVM1') return null;

  const formatVersion = view.getUint16(4, true);
  const count = view.getUint32(8, true);
  const width = view.getFloat32(12, true);
  const height = view.getFloat32(16, true);
  if (!Number.isFinite(count) || count <= 0) return null;

  const headerBytes = formatVersion >= 3 ? HEADER_BYTES_V3 : HEADER_BYTES_V1V2;
  if (buffer.byteLength < headerBytes) return null;
  const basePointSize = formatVersion >= 3 ? view.getFloat32(20, true) : 2.0;
  const autoExposure = formatVersion >= 3 ? view.getFloat32(24, true) : 1.6;

  const targetsBytes = count * 3 * 4;
  const startsBytes = count * 3 * 4;
  const colorsBytes = count * 3;
  const bakedChannelBytes = formatVersion >= 2 ? count : 0;
  const shapeChannelBytes = formatVersion >= 4 ? count : 0;
  const randomsBytes = count;
  const expectedLength =
    headerBytes +
    targetsBytes +
    startsBytes +
    colorsBytes +
    bakedChannelBytes * 3 +
    shapeChannelBytes * 5 +
    randomsBytes;
  if (buffer.byteLength < expectedLength) return null;

  let offset = headerBytes;
  // Zero-copy views: both blocks start at a 4-byte-aligned offset (headerBytes
  // is always a multiple of 4, then +targetsBytes which is itself a multiple
  // of 4), which Float32Array requires.
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

  let shapesU8: Uint8Array | null = null;
  let aspectsU8: Uint8Array | null = null;
  let rotationsU8: Uint8Array | null = null;
  let softnessU8: Uint8Array | null = null;
  let glowU8: Uint8Array | null = null;
  if (formatVersion >= 4) {
    shapesU8 = new Uint8Array(buffer, offset, count);
    offset += count;
    aspectsU8 = new Uint8Array(buffer, offset, count);
    offset += count;
    rotationsU8 = new Uint8Array(buffer, offset, count);
    offset += count;
    softnessU8 = new Uint8Array(buffer, offset, count);
    offset += count;
    glowU8 = new Uint8Array(buffer, offset, count);
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

  const shapes = new Float32Array(count);
  const aspects = new Float32Array(count);
  const rotations = new Float32Array(count);
  const softness = new Float32Array(count);
  const glow = new Float32Array(count);
  if (shapesU8 && aspectsU8 && rotationsU8 && softnessU8 && glowU8) {
    for (let i = 0; i < count; i++) shapes[i] = shapesU8[i];
    for (let i = 0; i < count; i++) aspects[i] = 1.0 + (aspectsU8[i] / 255) * 5.0;
    for (let i = 0; i < count; i++) rotations[i] = (rotationsU8[i] / 255) * TAU;
    for (let i = 0; i < count; i++) softness[i] = softnessU8[i] / 255;
    for (let i = 0; i < count; i++) glow[i] = glowU8[i] / 255;
  } else {
    // Pre-v4 fallback: every particle renders as a round splat with the old
    // uniform circular falloff (softness 0.5) and a modest, even glow.
    shapes.fill(0);
    aspects.fill(1.0);
    rotations.fill(0);
    softness.fill(0.5);
    glow.fill(0.2);
  }

  return {
    count,
    starts,
    targets,
    colors,
    alphas,
    sizes,
    reveal,
    shapes,
    aspects,
    rotations,
    softness,
    glow,
    randoms,
    width,
    height,
    basePointSize,
    autoExposure
  };
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
