# Cesium migration benchmark

Status: first local prototype and offline format measurements, NOT a completed performance comparison.
Cleanup gate CLOSED. Feature parity is NOT PASS.

## Measured prototype results (2026-09-18)

Mont Blanc bbox [6.7,45.75,6.98,46], geographic levels through 13,
241 terrain tiles, 65x65 samples per tile, identical native DEM input.

| Format | Raw bytes | Sum of individually gzipped tile bytes |
|---|---:|---:|
| Heightmap-1.0 | 2,036,932 | 1,389,271 |
| Quantized mesh | 18,107,294 | 1,520,034 |

Source: ignored local `tools/terrain/cesium/build/terrain-format-benchmark.json`.
Quantized encoder 0.5.0 uses the same regular grid WITHOUT adaptive simplification.
These are file sizes, NOT measured HTTP transfer or proof that heightmap is the
final better format. Runtime currently uses heightmap; quantized runtime A/B is pending.
The outer 0.02-degree prototype band blends elevation to zero. Vertical datum
conversion is unverified; 10m terrain clearance is NOT certified.

Desktop and 390x844 emulated viewport visually render the globe, local imagery,
countries and capitals. Italy search, selection, fly-to and closing the mobile
country panel were exercised. After reload, country/capital label collisions in
the inspected Italy view were absent. Physical iPhone gestures/FPS remain NOT RUN.
No frame-rate or memory superiority claim is made.

Validation: 134 test files / 1387 tests passed, TypeScript passed, lint passed
with 34 existing warnings, local OpenNext build passed without deploy. TypeScript
and focused Cesium tests were repeated after the final label changes. Build emits
a broad dynamic-file tracing warning for the local asset route; hardening remains.
Engine-versus-Viewer transferred bundle comparison is still NOT RUN.

## Baseline

Three Alps: 462 GLBs, 154 per L0/L1/L2, bbox [6,45.65,7.54,46].
Same source DEM/Sentinel files must feed both engines. Native elevations 1x.
Pre-migration source snapshot is documented in CESIUM_MIGRATION_PLAN.md.

## Protocol

For each engine and format, cold and warm runs, three repeats, same viewport,
DPR, camera WGS84 pose/footprint, lighting, tile error budget and label count.
Scenes: Europe globe; France regional; Alps overview; Mont Blanc oblique close.
Desktop and 390x844 viewport; distinguish emulation from physical iPhone testing.
Record browser/GPU/device/version and all unavailable metrics honestly.

| Metric | Three | Cesium heightmap | Cesium quantized mesh |
|---|---|---|---|
| Initial transferred JS / page MB | NOT RUN | NOT RUN | NOT RUN |
| Terrain / imagery bytes / HTTP requests | NOT RUN | NOT RUN | NOT RUN |
| First render / detailed terrain time | NOT RUN | NOT RUN | NOT RUN |
| JS heap / GPU estimate | NOT RUN | NOT RUN | NOT RUN |
| Triangles / draw calls | NOT RUN | NOT RUN | NOT RUN |
| Desktop/mobile FPS, CPU/GPU timing | NOT RUN | NOT RUN | NOT RUN |
| Terrain storage / compression | NOT RUN | NOT RUN | NOT RUN |
| Seams / close-camera penetration / visual quality | NOT RUN | NOT RUN | NOT RUN |

GPU memory and private command counters are estimates, not portable public
WebGL metrics. ResourceTiming transferSize=0 may mean cache, not zero payload.
Do not compare development chunks with production minified chunks.

## Parity gate

NOT YET VERIFIED: globe, atmosphere, lighting, stars, countries, borders,
highlight, selection, capitals, labels, terrain, Alps, LOD/streaming, timeline,
historical territories, events/models, fly-to, fullscreen, mobile, desktop,
UK/RU/EN. C11 remains prohibited until all pass and visuals are accepted.
