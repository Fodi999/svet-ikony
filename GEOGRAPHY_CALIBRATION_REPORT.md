# Country borders calibration — 2026-09-10

Implemented on the existing public history route. No commit, push or deployment.

## Data source

Natural Earth Admin 0 Countries, 1:50m, official repository release v5.1.2.
[Dataset](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/)
· [Public domain terms](https://www.naturalearthdata.com/about/terms-of-use/).
Natural Earth's default de facto convention is retained, including disputed
territories. This is a cartographic snapshot, not a live boundary-control map.
Source hash and reproducible preparation command are in `lib/visualizer/README.md`.

## Earth calibration

Actual asset tested: unchanged `earth_web_v3.glb`, 9,625,432 bytes.
SHA-256: `dc61daf693786ea7a6cd83b7685caa40aac4f4a52925ea5557dc86ec5e0ee6e7`.

- Source GLB: north +Y, Greenwich +X, east toward −Z.
- Existing normalization yaw: −89.999999238° around Y, derived from GLB anchors.
- Public geographic frame: north +Y, Greenwich +Z, east +X.
- New geographic-layer calibration offset: 0°; no second rotation and no country-specific corrections.
- All six embedded geographic anchors match the common conversion; largest measured angular error 0.00000226° (CPU GLTF parse with image decoding stubbed, used only for transform checks).

The measured world bounding sphere of the solid `Earth` mesh has:
center `(0, −0.00030804198, 0)`, radius `1.78690617401`.
Border radius = `1.79226689253` (×1.003, offset `0.00536071852`, 0.3%).
Measurement excludes child atmosphere and clouds. Original GLB is not rewritten.

## Geometry and lifecycle

242 features, 1,632 rings → 78,720 independent segments / 157,440 vertices.
One `LineSegments`, one material, 1,889,280 bytes of position attributes.
Independent rings preserve islands and holes. Identical shared segments are
rendered once. Great-circle subdivisions of at most 1° avoid antimeridian chords
and keep the line segment interior above the surface.

Style: `#e6d5a8`, opacity 0.58, standard thin WebGL lines, no glow,
`depthTest: true`, `depthWrite: false`. The opaque Earth hides the far side.
The overlay frame follows the actual animated Earth matrix; geometry is built
once per canvas instance. Fetch is shared and lazy. Toggle defaults ON and only
changes visibility. GPU resources are disposed with the scene.

## Validation

- Typecheck: passed.
- Tests: 949 passed, 95 files. Includes full dataset segment/radius checks,
  Polygon/MultiPolygon, island separation, duplicate edges, antimeridian,
  shared fetch, animated frame attachment, toggle lifecycle and disposal.
- Lint: zero errors; 24 existing warnings.
- OpenNext production build: passed. Existing middleware deprecation and
  SaintsCatalog bundled duplicate-key warnings remain outside this change.
- Production client assets contain no Geographic Calibration Debug UI.
- Real Chrome desktop check on localhost using the actual GLB copied into local
  R2/D1 through existing APIs. Production data/configuration were not changed.
- Browser console: no warnings/errors observed during the geographic test.

## Visual check

Checked the actual rendered GLB at overview and closer zoom, then orbited east
and south with existing OrbitControls. No systematic texture/border offset was
observed at this dataset and texture resolution:

| Region | Result |
|---|---|
| Ukraine | Outline sits north of the Black Sea; common geographic alignment holds. |
| Italy | Peninsula, Sicily and Mediterranean coastline align. |
| Egypt | Mediterranean, Sinai and Red Sea fit the texture geography. |
| Saudi Arabia | Arabian Peninsula and Red Sea coastline align. |
| India | Peninsula and Sri Lanka coastlines align in the eastern orbit view. |
| South Africa | Southern cape and surrounding African boundaries stay attached. |

Mediterranean, Black and Red seas checked in the enlarged Europe/India view.
Central and southern African borders checked during southern orbit. No lines
bridging disconnected islands or showing through the planet were observed.
Very bright desert/cloud areas naturally have less contrast with the thin cream
lines; this is not a geographic offset. Not a survey-precision validation.

Screenshots: `artifacts/geography/borders-desktop.png`,
`artifacts/geography/borders-europe-india.png`, `artifacts/geography/borders-africa.png`,
`artifacts/geography/borders-occlusion.png`, `artifacts/geography/borders-off.png`.
Pacific-side orbit confirms Europe/Africa are hidden by the Earth. Desktop
viewport height and document scrollHeight both measured 992 px (no page scroll).

## Performance

Measured renderer draw calls: 7 with borders OFF, 8 with borders ON, 14 with the
six development-only debug point meshes enabled. Steady development-view samples
reached 59–60 FPS with borders ON; the post-build OFF sample was 56 FPS.
These short samples show no detectable regression, but are not a GPU benchmark.
During simultaneous test/build activity and
background-tab transitions samples fell (4–50 FPS); those are not a controlled
comparison of the layer's GPU cost. The reliable incremental cost measured here
is one draw call, with no per-frame geometry recalculation.

Only frontend geography, its small control, tests, data and documentation changed.
Camera composition, OrbitControls parameters, zoom handling, routes, API contracts,
D1 schema, R2 upload logic, GLB loading, WebGL2 gate, dynamic imports, visibility
pause and DPR clamp retain their existing behavior. Local Base Earth is left set
up so the result can be inspected at `/uk/pravoslavna-istoriya`.
