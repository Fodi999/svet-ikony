/** Distances are Earth-radius multiples; bytes are compressed GLB bytes. */
export const TERRAIN_PERFORMANCE = {
  selectionIntervalMs: 120, evictionIntervalMs: 1000, tileFadeSeconds: 0.3,
  visibleAltitude: 2, preloadAltitude: 3.5, unloadAltitude: 5,
  distantRetentionFactor: 0.5, boundsSamples: 12, boundsPaddingRatio: 0.001,
  desktop: { dpr: 2, concurrent: 2, neighborBudget: 4, visibleBudget: 9, gpuRetentionMs: 45_000, byteRetentionMs: 300_000, byteBudget: 96 * 1024 * 1024 },
  mobile: { dpr: 1.25, concurrent: 1, neighborBudget: 1, visibleBudget: 4, gpuRetentionMs: 12_000, byteRetentionMs: 120_000, byteBudget: 48 * 1024 * 1024 },
} as const;
export type TileState = 'UNLOADED' | 'LOADING' | 'READY' | 'VISIBLE' | 'HIDDEN' | 'FAILED';
