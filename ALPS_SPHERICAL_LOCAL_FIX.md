# Alps spherical rendering fix

Date: 2026-09-17. Local development only.

Border behavior below is superseded by `ALPS_BORDER_LOCAL_FIX.md`: complete
segment replacement, 30 m clearance, 50 m sampling and an outside-DEM transition.
That report also documents the untested Swiss-border DEM coverage limitation.

## Root causes

- The Alps controller kept the perspective near plane at 0.2 physical meters
  (approximately 5.65e-8 scene units), including continent-scale views, while
  retaining the globe's far plane. Depth precision collapsed. The reported
  black/white fragments were reproduced over Europe before the correction;
  they disappeared with the distance-aware near/far range. This was not an
  Alps texture sampling a polar atlas region.
- Globe country lines were at radius factors 1.003 and 1.0044, approximately
  19 km and 28 km above sea level. Highlight fills were another elevated shell.
  These are inappropriate for a camera inside mountain terrain.
- The old pipeline stored AEQD coordinates but already projected them to a
  sphere at runtime. It was not simply an unprojected flat plane. Nevertheless,
  the final Alps geometry now uses direct lat/lon/native-height construction,
  removing the dependency on recovering heights from legacy AEQD positions.
- Tile-edge normals and skirt contributions can produce dark edge shading.
  Shared native DEM derivatives now give shared edge vertices identical normals.
- No invalid indices, nonfinite positions, degenerate triangles or inverted
  surface winding were found in the rebuilt 48-mesh regression audit.

## Changes

- `lib/visualizer/alps-spherical.ts`: builds all runtime surface/skirt vertices
  with the project's `latLngToVector3` and measured Earth radius (nominally 1.8).
  Zero elevation is on the base sphere. Regional rebasing before Float32 storage
  preserves precision; it is a rigid frame, not a planar map projection.
  Native heights are unchanged. Explicit ClampToEdge texture addressing.
- `lib/visualizer/alps-stream.ts`: direct spherical rebuild for L0/L1/L2,
  spherical morph positions, conservative bounds for skirts and morphs,
  current rendered-height sampling for borders, cached surface revisions.
  Existing outer-edge alpha now actually blends via transparent materials.
- `lib/visualizer/alps-borders.ts`: clips original elevated border segments out
  of the DEM footprint and replaces them with 5 m-spaced samples, 8 m above the
  displayed surface, including its LOD morph. Globe fills/markers are hidden at
  close scale and restored on exit. Original border geometry is restored too.
- `lib/visualizer/terrain-controller.ts`: adaptive camera depth range, exact
  near/far restoration, and lifecycle management for draped borders.
- `lib/visualizer/terrain-alignment.ts`: optional diagnostic border offset;
  Alps uses 8 m rather than the legacy 600 m. Other regions keep their default.
- `lib/visualizer/alps-spherical.test.ts`, `alps-stream.test.ts`: depth,
  spherical placement, actual generated geometry, shared vertices/normals,
  UV/clamping, border height/restoration and camera-clearance regressions.

The on-disk GLBs remain the existing local transport bundles. Their positions
are replaced before rendering from the native DEM and geographic lattice.
No rebuild/upload/publish contract was changed for this fix.

## Verification

- `npx vitest run lib/visualizer`: 129 tests passed, 15 files.
- `npx tsc --noEmit --incremental false`: passed.
- ESLint on the changed TypeScript files: passed.
- All 48 runtime meshes: 1,617,664 triangles; maximum radial height error
  0.000187 m after Float32 storage. Shared edge positions/normals agree.
- Nearest DEM triangle at the 10 m Mont Blanc camera: 9.957886 m clearance.
- Local browser: FR, CH and IT select the Alps stream; continent view, zoom to
  20 km, 1 km and 10 m above Mont Blanc, oblique drags and return to globe checked.
  The reported fragmented Earth/polar-looking shards did not recur in these views.
- Desktop 20 km view: 13 L1 + 3 L2 tiles, 382,020 terrain triangles,
  SSE 2.99 / 3 px, no tile failures, approximately 60 FPS in the test session.
  Near/far at that view: 0.00111942 / 3.78701 instead of a fixed microscopic near.
- 10 m view: 4 L2 tiles, 369,792 terrain triangles; canvas framebuffer sampling
  confirmed rendered, nonblank pixels. Snow texture is naturally almost uniform
  at this scale; the test does not claim sub-meter image detail.
- Back to globe: GLOBE state, zero visible terrain tiles, ordinary sphere intact.
- Mobile viewport 390x844: Italy, explicit zoom activation, 20 km and oblique
  drag checked. 16 L1 tiles, 128,832 terrain triangles, SSE 2.26 / 3 px,
  approximately 60 FPS, 9 distinct framebuffer sample colors, no console errors.

## Scope and limits

The DEM still covers only lon 6.7..6.98, lat 45.75..45.95, not all of the Alps.
Outside this footprint the existing globe and its borders remain in use. Edge
blending softens the finite patch but cannot create missing surrounding heights.
Sentinel RGB is 10 m/pixel and the DEM is approximately 30 m, so very close views
are not photogrammetric. Densifying borders does not improve the accuracy of the
existing country-boundary dataset. Browser checks are sampled views, not proof
against every camera path or every GPU.

R2/D1 = untouched. No production deployment, upload or publish command was run.
