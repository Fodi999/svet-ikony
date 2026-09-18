# Cesium migration plan

Audit date: 2026-09-18. C0 completed before migration code changes.
Production remains Three. No deployment, R2 write, production D1 change,
earth publish, or terrain upload is authorized in this migration.

## Recovery

Pre-migration source snapshot (643 paths, including untracked source):
`/Users/dmitrijfomin/Desktop/CodexWorkspace/cesium-checkpoint-20260918/source/`.
Sibling HEAD.txt and working-tree.patch preserve the commit ID and tracked diff.
Ignored DEM/Sentinel/build assets remain in place and are not overwritten.
No checkpoint commit was made: the worktree contains substantial unrelated work.
Rollback: select engine=three; restore only individually reviewed migration files
from the snapshot if needed. Never reset the whole dirty worktree.

## Dependency graph

```text
app/pravoslavna-istoriya/page.tsx
  -> HistoryVisualizer (search, selection, layers, panels, fullscreen)
     -> TimelineScrubber -> chronology / timeline-position / explorer
     -> CountryPanel -> country-metadata
     -> Earth3DCanvas
        -> base-scene / default-earth / GLTFLoader / OrbitControls
        -> geography -> Three Vector3 (radius 1.8, not WGS84 meters)
        -> country-borders -> countries -> country-interaction
           -> country-camera / country-highlight / country-labels
        -> capital-cities -> Natural Earth capitals JSON
        -> historical-layer -> historical-territories -> prototype.json
        -> marker-clustering / event-country
        -> space-environment / render-metrics
        -> terrain-controller
           -> TerrainStream / TerrainSelector / TerrainByteCache
           -> AlpsStream -> alps-spherical / alps-borders
           -> terrain-loader -> GLTFLoader / terrain contract
           -> terrain-alignment / terrain-projection
app/terrain/[region]/[lod]/[file]/route.ts
  -> Alps local build directory (no remote fallback)
  -> other regions: TerrainStorage -> media bucket
app/api/admin/terrain-bundles/* -> auth + local gate + TerrainStorage
Blender addon -> scripts/terrain/local_region.py
  -> region_plan / generate_alps_dem / native_dem / verify_alps_dem
  -> tools/terrain/alps/build/L0,L1,L2
PrayerVisualizerCanvas -> Three + EffectComposer / bloom (SEPARATE consumer)
```

## Ownership / migration map

| Existing files | Disposition | Cesium replacement / retained responsibility |
|---|---|---|
| Earth3DCanvas, base-scene, default-earth | MIGRATE then REMOVE globe runtime | CesiumWidget, Globe, WGS84 |
| geography, terrain-alignment, terrain-projection, alps-spherical | MIGRATE then REMOVE renderer math | Cartesian3, Cartographic, Transforms; no radius-1.8 reuse |
| country-camera, OrbitControls | MIGRATE | Camera, ScreenSpaceCameraController, flyTo |
| country-borders, country-highlight, alps-borders | MIGRATE | GroundPolylinePrimitive / GeoJsonDataSource; terrain clamping |
| countries, country-metadata, country-messages, event-country | SHARED | Data, localization and point-in-polygon; remove runtime Three coupling from shared imports |
| capital-cities | SPLIT/MIGRATE | Preserve 215 records; pure data helpers separate from Three layer |
| country-labels | MIGRATE | LabelCollection; COUNTRY > CAPITAL > CITY priority |
| historical-layer | MIGRATE | Cesium polygons/entities, UI-selected interval |
| historical-territories, chronology, explorer, marker-clustering | SHARED | Preserve editorial/time semantics and existing tests |
| space-environment | MIGRATE then REMOVE globe version | SkyAtmosphere, SkyBox, SunLight, Sun/Moon |
| terrain-loader, terrain-stream, terrain-selection, alps-stream | MIGRATE then REMOVE | Native terrain quadtree, request scheduler, SSE and cache |
| lib/terrain/contract, storage, http; terrain admin routes | KEEP pending migration | Existing GLB contract cannot describe geographic terrain; add separate contract/routes |
| scripts/terrain/native_dem.py, source cache, checksums | KEEP | Native sampling and provenance |
| generate_alps_dem.py / existing L0/L1/L2 | KEEP for A/B | New offline geographic export, do not rewrite baseline |
| earth_publish_addon.py / Earth_Master.blend | KEEP | Later separate Cesium build commands; no edit now |
| PrayerVisualizerCanvas / three dependencies | KEEP | Not part of globe migration; package removal prohibited while used |

## Audit findings

- Alps is 462 GLBs: 154 per LOD, 22x7 rectangular regional grid,
  bbox [6,45.65,7.54,46]. This is NOT Cesium geographic quadtree addressing.
- Native DEM cache is 5545x1261 Float32 samples, 1/3600 degree, with two GLO-30 sources.
- Sentinel TCI and west-strip supplements exist locally. Browser must consume
  generated local imagery, never upstream COGs.
- NASA global texture exists at `~/My project/Earth_Blender/textures/world.topo.200409.3x21600x10800.jpg`.
- Existing terrain config has desktop/mobile budgets, SSE and byte/GPU retention;
  compare equivalent camera footprints, not identical Three numeric coordinates.
- Current local preview intentionally supplies no published events. C7 needs local
  fixtures, not invented production records or production D1 mutations.
- Historical Rus data is GPL-3.0 and Byzantium is schematic. Preserve provenance;
  rendering parity does not certify historical accuracy or licensing compatibility.
- Existing public preview caches are generated under .next-earth-preview;
  ESLint must ignore them rather than lint generated output.
- Copernicus orthometric elevation vs Cesium ellipsoidal height needs explicit
  vertical datum treatment. A visual terrain prototype cannot certify 10m clearance
  until geoid conversion and collision tests pass.
- The interrupted Three CITY work has an imported local cities file. Preserve it
  in the checkpoint, but do NOT load/import it into the Cesium MVP. CityLayer is
  an interface only under the newer migration instructions.

## Phase gates

| Phase | Deliverable / gate |
|---|---|
| C0 | Audit, dependency map, recovery snapshot, verified data sources: done |
| C1 | Pin @cesium/engine; local Workers/Assets; no ion defaults; tests |
| C2 | Dev+loopback engine flag, WGS84, local NASA, existing UI; screenshot |
| C3 | Mont Blanc geographic heightmap and quantized-mesh A/B; checksums, availability, datum, seams; then expanded Alps |
| C4 | Countries, terrain-clamped borders, hover and selection; FR/CH/IT oblique QA |
| C5 | Existing 215 capitals, localized labels/cards; country-label collision priority |
| C6 | Search/fly-to/reset/zoom; native camera; 10m terrain clearance test |
| C7 | Existing history/timeline/events/models; year intervals and local fixtures |
| C8 | Desktop and iPhone-sized visual/performance QA, actual gesture/device caveats |
| C9 | Cold/warm A/B runs at Europe, France, Alps, Mont Blanc; bundle and terrain-format benchmark |
| C10 | Every mandatory parity item PASS; user visual acceptance and acceptable benchmark |
| C11 | Small reviewed cleanup only after C10, repo-wide references checked per file |
| C12 | Full tests, typecheck, lint, OpenNext build; no deployment |
| C13 | Versioned R2/Worker delivery design only, no uploads |

After every phase record real results; NOT RUN is not PASS. No destructive
cleanup until parity, benchmark and visual acceptance are all established.

## Current checkpoint

- C1: @cesium/engine 26.3.0 installed; CesiumWidget used, no Viewer or ion token.
  Measured engine-versus-Viewer bundle comparison remains open.
- C2: local NASA geographic imagery (682 tiles, levels 0-4), WGS84 globe,
  native atmosphere/stars/light and dev-loopback feature flag implemented.
- C3: Mont Blanc heightmap and quantized exports built separately from legacy
  Alps; addressing, same-level shared edges and finite mesh/index checks pass.
  Runtime heightmap works; quantized runtime comparison, vertical datum,
  cross-LOD visual seams and expanded Alps are not accepted yet.
- C4/C5 prototype: native ground borders, hover/selection, country labels and
  existing 215 capitals/cards. Country labels reserve screen space first.
  FR/CH/IT oblique terrain acceptance and all-locale QA remain open.
- C6: basic country search/fly-to/reset/zoom wired; full search and 10m camera
  collision acceptance remain open.
- C7: existing UI-filtered events and selected historical territory now feed
  Cesium native data sources. Event picking, event fly-to and selected GLB entity
  are wired; two event-layer unit tests pass. Historical visual/temporal parity,
  real model scale/orientation and local fixture browser acceptance remain pending.
  Follow-up: four event-layer tests now cover invalid coordinates, disposal,
  stale historical loads and visibility preservation. Native camera collision
  detection is explicitly enabled with minimumZoomDistance=10; this is a setting,
  not a passed 10m oblique DEM acceptance test.
  Button zoom now uses loaded terrain clearance and center-ray hit distance,
  cancels in-flight camera transitions, and preserves a 10m step margin. Two
  camera unit tests pass. Browser zoom was exercised on Mont Blanc; a persistent
  pale diagonal band remains over the imagery. Its terrain/border cause is not
  established. This visual defect blocks acceptance and must be diagnosed.
- C8-C10: complete device/performance A/B and parity acceptance are pending.
  KnowledgeLayerManager and CityLayer interfaces exist; manager integration is
  not complete. No ordinary city dataset is loaded by the Cesium prototype.
- C11: BLOCKED BY ACCEPTANCE GATE, no legacy removal performed.
- C12: interim full tests/typecheck/lint/OpenNext build passed, not final parity.
- C13: future delivery design only; no R2 uploads or D1 production changes.

Local prototype: http://localhost:3001/uk/pravoslavna-istoriya?engine=cesium&terrainRegion=alps
Rollback comparison: same URL with engine=three. Production always resolves Three.
The two renderers are not mounted together; shared legacy imports may still put
Three code in the Cesium page bundle and need separation before bundle acceptance.
