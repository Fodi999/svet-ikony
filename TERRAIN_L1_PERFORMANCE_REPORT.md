# LOCAL Terrain L1 performance — 2026-09-11

## BEFORE

Measured in Chrome on this Mac, desktop DPR 2, settled frames (not initial decoding/compilation).

| Scene | FPS | Draw calls | Visible terrain tiles | Triangles | CPU ms | GPU ms |
|---|---:|---:|---:|---:|---:|---:|
| Globe | 30.0 | 4 | 0 | 43,392 | 0.41 | 1.96 |
| L1 all tiles | 30.0 | 16 | 9 | 339,536 | 0.69 | 3.05 |

## AFTER

Browser scenarios, desktop DPR 2. These are observed 500 ms windows, not controlled multi-run averages. CPU/GPU timing varies; no significant timing improvement is claimed from single samples. Initial loading/first shader compilation is excluded and can still cause transient stalls.

| Scenario | FPS | Draw calls | Visible tiles | Triangles | CPU ms | GPU ms |
|---|---:|---:|---:|---:|---:|---:|
| A / H globe after return | 30.0 | 4 | 0 | 43,392 | 0.50 | 1.65 |
| B Ukraine initial | 30.0 | 14 | 9 | 326,544 | 1.23 | 4.48 |
| C west | 30.0 | 6 | 4 | 97,028 | 0.75 | 2.82 |
| D center | 30.0 | 6 | 3 | 97,028 | 0.99 | 1.91 |
| E south | 30.0 | 6 | 2 | 97,028 | 0.88 | 1.93 |
| F edge | 29.9 | 3 | 2 | 63,168 | 0.58 | 2.23 |
| G return west | 30.0 | 6 | 4 | 97,028 | 0.79 | 6.35 |

G retained 9 network requests / 38.64 MB: no second download. Visible counts are selector/fade state; actual renderer frustum culling may reject additional objects. Draw counts include Base Earth, country and boundary layers, so they do not equal tile counts.

## BOTTLENECKS FOUND

50–60 FPS was **not achieved in this environment**. A development control probe skipping renderer.render entirely still measured **30.0 FPS**, CPU **0.09 ms**, GPU **0.00 ms**. Thus terrain draw cost does not explain the observed 30 FPS cadence. The browser/system scheduling limit is supported by this control; its specific OS/browser cause remains unverified. No browser or power settings were changed.

Avoidable work found: all nine terrain meshes submitted regardless of view, static geographic projection and normal transforms in the vertex shader, hidden cloud/atmosphere draws, indefinite GPU retention. These have been reduced. Initial decode/compile/upload remains an asset-loading cost. CPU metric covers instrumented frame work, GPU uses asynchronous EXT_disjoint_timer_query_webgl2 when available; neither is an OS-wide profiler.

## SELECTIVE LOADING

Camera frustum, manifest geographic bounds, hemisphere and Earth-relative distance determine demand. Six tile states: UNLOADED, LOADING, READY, VISIBLE, HIDDEN, FAILED. Concurrent requests/decode are deduplicated. Visible tiles have priority; immediate Manhattan-neighbor tiles preload within a budget. Per-tile 300 ms fade supplements existing region transition. Initial wide desktop view legitimately needs all nine tiles.

## FRUSTUM CULLING

Conservative static bounds sample manifest extent/heights. Runtime projected geometry gets valid boundingBox and boundingSphere, frustumCulled=true. World volumes update only on root/frame transform changes. Camera/projection change detection is throttled to 120 ms and invalidated after resize. Idle browser selection count remained unchanged between readings (edge: 38); no idle geographic selection loop.

## CACHE POLICY

| Policy | Desktop | Mobile |
|---|---:|---:|
| Concurrent loads | 2 | 1 |
| Maximum visible | 9 | 4 |
| Neighbor budget | 4 | 1 |
| GPU retention | 45 seconds | 12 seconds |
| Verified byte cache TTL | 5 minutes | 2 minutes |
| Byte budget | 96 MiB | 48 MiB |
| DPR ceiling | 2 | 1.25 |

Distance thresholds are centralized in terrain-config.ts: visible altitude <=2 Earth radii, preload <=3.5, very far >5; very-far GPU retention halves. GPU disposal and verified ArrayBuffer cache are separate. Expired GPU resources can be decoded again from cached bytes. Cache is bounded by TTL/LRU and cleared on runtime disposal. A failed tile does not enter a blind per-frame retry loop; existing safe fallback remains.

## MATERIAL AUDIT

Source bundle: nine meshes, nine primitives, nine different PBR materials; no extra water mesh or unnecessary terrain children. Source materials are OPAQUE, double-sided. forceSinglePass avoids double transparent rendering. Source textures differ, so merging material instances would lose tile-specific maps.

After fade, interior material can return to opaque/depthWrite; eight outer tiles retain transparency for required edge feather. Hidden tiles can retain transparent flags but are not rendered. Base Earth cloud and atmosphere layers become invisible at complete L1 mix, removing two draws, and restore on return. Tile border debug is off by default. An edge audit with center hidden reported nine transparent materials; that includes non-rendered cached materials and is not nine transparent draws.

## TEXTURE AUDIT

All nine source GLB hashes remain unchanged. 27 unique embedded images, no repeated image hashes across tiles. Per tile: color JPEG 2048x2048, normal PNG 1024x1024, ORM PNG 1024x1024. Runtime color uses srgb; normal/ORM use no color-space conversion. Mipmaps enabled, linear mipmap filtering, anisotropy 1.

Runtime has 36 Texture wrappers for nine tiles (ORM is referenced through additional GLTFLoader texture variants); renderer reports 27 terrain GPU textures plus five base textures, not 36 additional GPU allocations. Embedded ORM pixels are not separately downloaded. The runtime audit exposes wrapper count explicitly. Future asset-level compression/atlas work may reduce transfer/GPU memory but is outside this phase; no images or GLB were regenerated.

## RENDER LOOP

Geographic vertex/normal/tangent projection is baked once into decoded runtime buffers using the existing projection math, not recomputed in GLSL each frame. Source GLB remains byte-identical. Bounds and anchor transforms are static. Reused temporary vectors/matrices; queue only rebuilt when demand/loading changes. No new per-frame point-in-polygon work or React state updates. Performance output uses a DOM ref at 2 Hz; terrain UI notifications are throttled. Development-only no-draw probe, area presets and texture audit are hidden from production.

## MOBILE

390x844 viewport browser verification: REGION_L1, 5 loaded / 4 visible / 1 cached, 5 requests, 22.61 MB, 30.0 FPS, 9 draws, 162,704 triangles, 17 GPU textures, 11 geometries. Observed DPR 1 (viewport emulation); ceiling is 1.25. Existing explicit mobile zoom gate and country sheet work. After return and the retention interval: 0 loaded / 0 visible / 0 GPU cached, GPU textures dropped to the five base textures; verified bytes remained 22.61 MB and request count stayed five. This is viewport verification on a Mac, not a physical-phone performance benchmark.

## FILES CHANGED

This performance phase:
- components/site/visualizer/Earth3DCanvas.tsx — diagnostics and DPR handling.
- lib/visualizer/terrain-controller.ts — streaming integration, transition and development camera presets.
- lib/visualizer/terrain-loader.ts — split verified bytes and GLB decode.
- lib/visualizer/terrain-projection.ts — one-time runtime projection and bounds.
- lib/visualizer/terrain-config.ts — central policies (new).
- lib/visualizer/terrain-selection.ts — demand selection (new).
- lib/visualizer/terrain-stream.ts — states, queues, caches and disposal (new).
- lib/visualizer/render-metrics.ts — CPU/GPU metrics (new).
- lib/visualizer/terrain-controller.test.ts — lifecycle isolation.
- lib/visualizer/terrain-stream.test.ts — eight new selection/cache/failure tests.

Earlier LOCAL terrain integration files are also uncommitted; they are not all new changes from this performance phase. Base Earth, source GLBs, manifest contract, D1 and R2 contents unchanged. No commit, push, deployment or publication.

## TESTS

- Full suite: **102 files, 1036 tests passed**.
- Typecheck: passed after correcting diagnostic image typing.
- Build: OpenNext build complete; existing bundler warnings retained in build.log.
- Browser: A–H exercised, local mobile viewport exercised, texture audit and no-draw control recorded.
- New tests cover selective/hemisphere/distance bounds, idle detection, mobile budget, static projection, request dedupe, byte TTL/budget, GPU eviction with cache reuse, load preparation race and failure behavior.

Artifacts: artifacts/terrain-l1-performance/material-audit.json, tests.log, build.log.
