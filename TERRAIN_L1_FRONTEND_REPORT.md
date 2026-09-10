# LOCAL L0 → L1 frontend integration

## FILES CHANGED

- `components/site/visualizer/Earth3DCanvas.tsx`: connects a LOCAL-only dynamically imported terrain controller; existing scene/camera, render loop, pause, DPR clamp, fallback and disposal retained.
- `components/site/visualizer/HistoryVisualizer.tsx`: clears selected country on Back to globe without resetting the camera.
- `lib/visualizer/terrain-state.ts`: explicit view levels, uk/ru/en messages, mobile/device policy.
- `lib/visualizer/terrain-loader.ts`: reusable manifest/tile/level loader and unload.
- `lib/visualizer/terrain-controller.ts`: lifecycle, staging, shader warmup, fade, camera limits and resource ownership.
- `lib/visualizer/terrain-alignment.ts`: common root matrix, actual manifest anchor checks, tile boundary diagnostics.
- `lib/visualizer/terrain-projection.ts`: shared AEQD-to-sphere projection, radial height and normal/tangent correction, outer-edge feathering.
- `lib/visualizer/terrain-frontend.test.ts`, `terrain-controller.test.ts`: 13 new tests.

Existing untracked backend `lib/terrain` and terrain routes are from the preceding bundle upload stage, not changed in this frontend stage. No edits to country interaction, Base Earth assets, Blender, GLBs, manifest, R2 or D1 schema. No commit/push/deploy.

## TERRAIN LOADER

`loadTerrainManifest(url)`, `loadTerrainTile(tile)`, `loadTerrainLevel(manifest)`, `unloadTerrainLevel()`.

All nine tiles are decoded sequentially to bound temporary memory. Browser checks actual SHA-256, MIME and byte length before GLTF parsing. Fetch timeout 30 seconds per request; cancellation disposes late decoded results. An incomplete group never enters the scene. Shaders compile before the transition.

One loaded level is reused on second entry during the same canvas lifetime. Returning to GLOBE hides the terrain; disposal occurs on canvas teardown, failure or cancellation. The cache is not persistent across page reloads. No per-frame recomputation of tile matrices.

## MANIFEST USAGE

Source: http://localhost:3000/terrain/eastern_europe_test/L1/manifest.json

Tile IDs, grid, LOD, paths, transforms, bounds, coordinate origin, units, radius, elevations, anchors, texture gutters and resolutions come from manifest. No hardcoded nine-file list. Only selecting UA starts L1; hover never initiates loading. L2/L3/HISTORICAL_SCENE have type-level reserved view states, not loaders or user actions.

## ALIGNMENT

All GLBs remain in their baked coordinates under one `TerrainRoot`. Its matrix uses east/up/south basis, manifest origin and measured Earth radius. Individual tile offsets are not adjusted.

The source uses AEQD arc distances plus spherical sag. A rigid matrix alone gave residuals Kyiv 43 m, Lviv 602 m, Odesa 47 m, Kharkiv 291 m. A shared vertex projection now converts arcs to spherical chords and applies exaggerated elevation radially; normals/tangents use the corresponding Jacobian. This is a common runtime projection, not a GLB or vertex-buffer edit.

Actual manifest anchors now match the mathematical globe frame within the 0.2 m test tolerance (double-precision check reports 0 for all four). This measures coordinate alignment, not the cartographic accuracy of the satellite image or DEM. Rendered positions use GPU floating point.

Actual GLB check: nine unchanged SHA-256 values, 12 adjacent edges, at least 129 exactly identical float32 vertices per edge, maximum shared position delta 0. The common projection preserves those equalities. Internal texture seams were visually inspected with debug off/on. Only the outer regional edge is feathered; glTF UV north-to-south row orientation has a regression test.

## TRANSITION

Existing country fly-to begins first; manifest/tiles load in the background while Earth remains available. Once the level and shaders are ready and fly-to is finished, opacity transitions over approximately 800 ms. Existing Earth colour is softened and clouds/atmosphere fade temporarily, then all original values are restored on exit. No camera recreation or page reload. Reduced-motion preference shortens the transition.

## CAMERA

Same camera and OrbitControls throughout terrain entry/exit. Near plane and zoom limits are expanded temporarily. Minimum perspective distance includes the maximum exaggerated manifest elevation plus a safety margin; it prevents entering the surface. Back to globe fades terrain and smoothly retreats along the current viewing direction. Country interaction is unchanged. Selecting another country exits terrain.

## FPS

Measured through the existing render loop and Tile Debug in Chrome. Initial desktop GLOBE approximately 60 FPS; later desktop/mobile sessions around 30 FPS, with temporary 19–30 FPS during concurrent builds. Final post-build desktop readout: 30 FPS, 16 draw calls, Tile Debug off. These are observations on the current computer, not an isolated benchmark or guaranteed device performance.

## DRAW CALLS

- GLOBE without selection: 4.
- GLOBE with country selection: 7.
- REGION_L1: 16.
- REGION_L1 with Tile Borders: 17.
- Downloaded terrain GLBs: 38,635,496 bytes (38.64 MB). This is compressed transfer size, not decoded GPU memory.

## MOBILE

390×844 browser viewport verified: choosing UA stays GLOBE with 0/0 tiles and 0 MB. Explicit zoom then starts L1 and reaches 9/9. Selection alone is insufficient: a user zoom gesture plus distance/zoom threshold is required. Save-Data, reported RAM below 4 GB, fewer than four cores or reported heap pressure prevent preloading. Browser memory APIs are optional; this is a heuristic, not a universal memory-pressure detector. Viewport override restored after testing.

## ERROR FALLBACK

Manifest/GLB HTTP, MIME, hash, decode and preparation errors leave GLOBE active, dispose staged resources and show the localized unavailable message. Tests verify no per-frame retry loop, partial-level rejection, cancellation cleanup and successful cached re-entry. Network failure paths were tested with mocks; actual LOCAL bundle loading was verified in the browser.

## TESTS

1028 tests passed across 101 files, including 13 new frontend tests. Typecheck passed. Next/OpenNext build passed (exit 0; OpenNext build complete). Known existing middleware-to-proxy and generated dependency duplicate-key warnings remain.

Browser acceptance performed: Base Earth; Ukraine hover; selection through selector and direct globe click; fly-to and loading state; L1; close zoom; Tile Debug off/on; Tile Borders 3×3; Back to globe; second entry; UK/RU/EN without losing the active level; mobile selection/zoom gating. The Carpathians, Kyiv/Dnipro area and Black Sea were visually inspected. No shader errors in captured console logs.

## DATA READBACK

LOCAL MCP reconcile still returns complete=true, verifiedAll=true and 9 tiles. Bundle ID:
`9504d9a8b32ef27fecd4380de745f7690e7b19e252978e1e424af8a4b74aced9`.

Base Earth remains `df3074f4-93cd-4295-b9fb-1951b5cd594a`. No publication, production requests, upload, permanent deletion or deployment during frontend integration.

Detailed evidence: `artifacts/terrain-l1/terrain-geometry-verification.json`, `terrain-anchor-verification.json`, `terrain-frontend-readback.json`.
