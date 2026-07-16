import type { PrayerParticleColorMode } from '@/lib/types';

export type ParticleField = {
  count: number;
  starts: Float32Array;
  targets: Float32Array;
  colors: Float32Array;
  randoms: Float32Array;
  /** Width/height of the sampled face box in scene units, for camera framing. */
  width: number;
  height: number;
  /**
   * A same-origin blob: URL for the same image, safe to hand to
   * THREE.TextureLoader for the background layer. Reusing this (rather than
   * the original remote URL) avoids re-fetching — and sidesteps the browser
   * potentially reusing a plain, non-CORS `<img>` cache entry for the same
   * URL (see loadImageCors below) which would taint that texture too.
   * Caller is responsible for revoking it (URL.revokeObjectURL) on cleanup.
   */
  objectUrl: string | null;
};

const GOLD: [number, number, number] = [0.87, 0.68, 0.32];
const SILVER: [number, number, number] = [0.82, 0.86, 0.92];
const WARM_WHITE: [number, number, number] = [0.96, 0.88, 0.74];

function colorFor(mode: PrayerParticleColorMode, luminance: number, rand: number): [number, number, number] {
  const base = mode === 'gold' ? GOLD : mode === 'silver' ? SILVER : mode === 'warm_white' ? WARM_WHITE : (rand > 0.45 ? GOLD : SILVER);
  const boost = 0.28 + Math.min(luminance, 0.72) * 0.42;
  return [base[0] * boost, base[1] * boost, base[2] * boost];
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Fetches the image as a CORS-mode request and decodes it from a same-origin
 * blob: URL instead of loading the remote URL directly through `<img>`.
 *
 * This matters because the same photo is usually already rendered elsewhere
 * on the page via a plain `<img src>` (no `crossorigin` attribute, i.e. a
 * "no-cors" load). The browser's HTTP cache keys purely on the URL, not on
 * request mode — so a later `fetch(url, { mode: 'cors' })` for the exact same
 * URL can still be served from that earlier opaque cache entry and taint
 * canvas reads, even though the server's CORS headers are perfectly correct.
 * Appending a stable, distinct query param forces a separate cache entry for
 * the CORS-mode load (still cacheable across repeat opens, just not shared
 * with the plain `<img>` load elsewhere on the page).
 */
async function loadImageCors(url: string): Promise<{ image: HTMLImageElement; objectUrl: string } | null> {
  try {
    const corsUrl = url + (url.includes('?') ? '&' : '?') + 'cors=1';
    const response = await fetch(corsUrl, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const image = await loadImageFromSrc(objectUrl);
    if (!image) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
    return { image, objectUrl };
  } catch {
    return null;
  }
}

/**
 * Samples the image's pixels once (via a hidden canvas) and turns bright/
 * opaque pixels into a particle field: random "start" positions scattered in
 * space, and "target" positions tracing the image, ready for the assemble
 * shader stage to interpolate between via uProgress.
 *
 * Returns null if the image can't be loaded or the canvas read is blocked by
 * CORS (cross-origin image without permissive headers) — callers fall back
 * to an ambient-only particle field in that case.
 */
export async function buildParticlesFromImage(
  imageUrl: string,
  maxCount: number,
  colorMode: PrayerParticleColorMode
): Promise<ParticleField | null> {
  if (typeof document === 'undefined' || !imageUrl) return null;

  const loaded = await loadImageCors(imageUrl);
  if (!loaded || !loaded.image.naturalWidth || !loaded.image.naturalHeight) return null;
  const { image, objectUrl } = loaded;

  const aspect = image.naturalWidth / image.naturalHeight;
  // Higher than the particle counts actually need per-pixel: sampling finely
  // and then striding down (below) keeps facial detail (eyes, hair strands)
  // instead of the blockier look a low-res source produces once assembled.
  const sampleHeight = 340;
  const sampleWidth = Math.max(1, Math.round(sampleHeight * aspect));

  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    return null;
  }

  let pixels: Uint8ClampedArray;
  try {
    ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }

  type Candidate = { x: number; y: number; luminance: number };
  const candidates: Candidate[] = [];
  function pixelStats(x: number, y: number) {
    const clampedX = Math.min(sampleWidth - 1, Math.max(0, x));
    const clampedY = Math.min(sampleHeight - 1, Math.max(0, y));
    const i = (clampedY * sampleWidth + clampedX) * 4;
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const a = pixels[i + 3] / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max > 0 ? (max - min) / max : 0;
    return { r, g, b, a, luminance, saturation };
  }

  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const { a, luminance, saturation } = pixelStats(x, y);
      if (a < 0.15 || luminance < 0.06) continue;
      const contrast = Math.max(
        Math.abs(luminance - pixelStats(x - 1, y).luminance),
        Math.abs(luminance - pixelStats(x + 1, y).luminance),
        Math.abs(luminance - pixelStats(x, y - 1).luminance),
        Math.abs(luminance - pixelStats(x, y + 1).luminance)
      );
      const isDetail = contrast > 0.045;
      const isFigureTone = luminance < 0.62 && saturation > 0.08;
      if (!isDetail && !isFigureTone) continue;
      candidates.push({ x, y, luminance });
    }
  }
  if (!candidates.length) {
    URL.revokeObjectURL(objectUrl);
    return null;
  }

  const stride = Math.max(1, Math.ceil(candidates.length / maxCount));
  const picked = candidates.filter((_, index) => index % stride === 0).slice(0, maxCount);
  const count = picked.length;

  const targetHeight = 1.7;
  const targetWidth = targetHeight * aspect;

  const starts = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randoms = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const point = picked[i];
    const nx = (point.x / sampleWidth - 0.5) * targetWidth;
    const ny = -(point.y / sampleHeight - 0.5) * targetHeight;

    targets[i * 3] = nx;
    targets[i * 3 + 1] = ny;
    targets[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

    const rand = Math.random();
    const gridCols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    const gridRows = Math.max(1, Math.ceil(count / gridCols));
    const gx = i % gridCols;
    const gy = Math.floor(i / gridCols);
    const squareX = ((gx + 0.5) / gridCols - 0.5) * targetWidth * 1.08;
    const squareY = -(((gy + 0.5) / gridRows - 0.5) * targetHeight * 1.08);
    starts[i * 3] = squareX + (Math.random() - 0.5) * 0.012;
    starts[i * 3 + 1] = squareY + (Math.random() - 0.5) * 0.012;
    starts[i * 3 + 2] = (Math.random() - 0.5) * 0.18;

    const [cr, cg, cb] = colorFor(colorMode, point.luminance, rand);
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
    randoms[i] = rand;
  }

  return { count, starts, targets, colors, randoms, width: targetWidth, height: targetHeight, objectUrl };
}

/** Ambient-only fallback field (no target image): a slow drifting point cloud. */
export function buildAmbientParticles(count: number, colorMode: PrayerParticleColorMode): ParticleField {
  const starts = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randoms = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    const theta = rand * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 0.6 + Math.random() * 1.8;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta) * 0.6;
    const z = radius * Math.cos(phi) * 0.4;
    starts[i * 3] = x;
    starts[i * 3 + 1] = y;
    starts[i * 3 + 2] = z;
    targets[i * 3] = x;
    targets[i * 3 + 1] = y;
    targets[i * 3 + 2] = z;
    const [cr, cg, cb] = colorFor(colorMode, 0.5 + rand * 0.3, rand);
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
    randoms[i] = rand;
  }

  return { count, starts, targets, colors, randoms, width: 1.7, height: 1.7, objectUrl: null };
}
