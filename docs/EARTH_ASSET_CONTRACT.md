# Earth Asset Contract

Contract between Blender (source) and the Three.js frontend (`lib/visualizer/*`,
`components/site/visualizer/Earth3DCanvas.tsx`) for the **base Earth GLB**
(the "Base Earth Model" delivered via `visualizer_models.is_base_earth`).
It does not cover terrain DEM/Sentinel-2 tiles (`lib/terrain/*`) — that is a
separate, currently dev-only system with its own coordinate contract
(`lib/visualizer/terrain-alignment.ts`).

Every rule below is enforced or read by real code today. Nothing here is
aspirational; a GLB that violates a "must" will render wrong or fail upload,
not just look wrong in theory.

## Required object

The glTF scene must contain an object named exactly `Earth` (case-sensitive).
`prepareBaseScene()` (`lib/visualizer/base-scene.ts`) does
`gltf.scene.getObjectByName('Earth') ?? gltf.scene` — if no object is named
`Earth`, the whole scene root is used instead, which also pulls in any sky
dome / Sun / Moon into the bounding-box and radius calculation. **Always
name the planet mesh's top group `Earth`.**

`Earth3DCanvas.tsx` also does `model.getObjectByName('Earth')` after load to
get `handle.earthSurface` — country borders, highlight overlays, historical
territories and (when enabled) terrain all derive their radius and transform
from this same object. Get this name wrong and every overlay breaks.

## Origin

The exported scene's geometry does not need to be pre-centered. On load,
`prepareBaseScene` computes `new THREE.Box3().setFromObject(earth)`, takes its
center, and recenters everything by that offset. **What matters is that the
bounding box center of the `Earth` object is a reasonable visual/geometric
center of the planet** — a lopsided model (e.g. a terrain patch bulging far
out on one side with nothing to balance it) will still be recentered
correctly on the box center, but the box center will not coincide with the
sphere's true center, and borders/markers will look slightly off-surface.
Keep the base globe itself round and centered on its own local origin.

## Runtime scale

Source-file units/scale do not matter. `prepareBaseScene` measures
`diameter = max(size.x, size.y, size.z)` of the `Earth` object's bounding box
and applies `model.scale.setScalar(3.6 / diameter)`. The result is always a
planet with **bounding-box diameter 3.6 Three.js units, i.e. runtime radius
1.8** — regardless of whether the Blender export used meters, a 1-unit
sphere, or anything else. Do not try to hit "radius 1.8" in Blender itself;
just keep the `Earth` object a clean, uniform sphere-like shape (SPHERE_RADIUS
in the Blender rig, e.g. 2.0, is irrelevant to this normalization).

## Coordinate system (public frame, post-calibration)

`lib/visualizer/geography.ts` — the single source of truth:

```
north  = +Y
east   = +X
Greenwich (longitude 0) = +Z
```

`latLngToVector3(lat, lon, radius)` uses
`setFromSphericalCoords(radius, PI/2 - lat*PI/180, lon*PI/180)`. Every
overlay (borders, highlights, historical territories, markers, timeline
camera fly-tos) is built in this frame and expects the calibrated `Earth`
object to match it exactly after `prepareBaseScene` runs.

## Orientation calibration — pick exactly one

`prepareBaseScene` computes a single yaw (rotation around +Y) and applies it
to the whole model. It supports two conventions; **use the second one
(`gltf_axes`) for all new exports** — the first is kept only for backward
compatibility with older uploads.

### 1. `gltf_axes` extras (preferred)

Set a custom property (glTF extras) on the `Earth` object itself:

```
gltf_axes = "north+y;greenwich+x;longitude+90-z"
```

Matched case-insensitively with whitespace stripped. It declares: the
model's own local +Y is the north pole / up axis (already true after
Blender's Z-up → glTF Y-up export conversion), and the model's own local +X
points at the Greenwich meridian (longitude 0). The loader takes the
object's local +X, transforms it by `Earth.matrixWorld`, and rotates the
whole model in Three.js so that direction lands on the public +Z axis. No
extra marker objects are needed with this method — export the object's own
extras, nothing else.

### 2. Legacy longitude-anchor child (old exports only)

A child node of `Earth` whose custom property `longitude` (a number, in
degrees) is set. `prepareBaseScene` reads the **first** such child it finds
(`earth.children.find(node => typeof node.userData.longitude === 'number')`),
takes its world position relative to the bounding-box center, and derives
yaw from `atan2` so that child ends up at its declared longitude. Do not mix
this with `gltf_axes` — if an anchor child exists, it takes priority and the
`gltf_axes` string on `Earth` is never even checked.

### No calibration present

If neither is present, `prepareBaseScene` silently falls back to yaw = 0.
This is never correct for a real geography-bearing export — treat "no
calibration metadata" as a hard export error, not an acceptable default.

## Allowed special object names

These exact names (or, for the last two, case-insensitive substring
matches) are recognized by existing code and change runtime behavior. Using
them for anything else will trigger that behavior unintentionally; using
different names for these purposes means the behavior below simply will not
happen.

- `Sun`, `Sun_Corona`, `Moon` — optional. Only used by
  `composeEarthOverview()` (`base-scene.ts`) to build the default "Earth
  from space" framing shot, and only when the GLB also carries an authored
  camera (see below). Safe to omit entirely.
- Any object whose `name` matches `/cloud|atmosphere/i` (anywhere in the
  scene, checked via `Earth3DCanvas.tsx`'s traversal, not only inside
  `Earth`) — its material opacity is faded and its visibility is toggled
  during the terrain zoom-in transition (`terrain-controller.ts`'s `enter`/
  `applyMix`). If a new atmosphere/cloud layer should participate in that
  fade, its name must contain "cloud" or "atmosphere"; if it should not
  (e.g. a fixed background element), avoid those substrings.

## Optional authored camera

If `gltf.cameras[0]` exists and is a `PerspectiveCamera` or
`OrthographicCamera`, `prepareBaseScene` clones it, applies the same scale
normalization to its near/far/ortho bounds, and returns it as the "overview"
camera used for the default Earth-from-space framing. Omitting a camera is
fine — the canvas's own default `PerspectiveCamera(45, aspect, 0.1, 100)` and
`OrbitControls` framing is used instead.

## File format

Enforced today by `lib/media/glb.ts` `validateGlb()` at upload time — a
rejected file never reaches R2:

- Must be a binary glTF **2.0** container (`asset.version === "2.0"`),
  correct GLB magic/version/length header, valid JSON chunk.
- **Every buffer and image must be embedded** as a `data:` URI. Any
  `buffers[].uri` or `images[].uri` that is not a `data:` URI (i.e. any
  external or relative file reference) is rejected outright — export with
  "embedded" textures/buffers in Blender's glTF exporter, never "separate"
  or "binary with external images".
- MIME type `model/gltf-binary` (uploads reporting the generic
  `application/octet-stream` are also accepted, but only when the filename
  ends in `.glb`).
- **No Draco, KTX2/Basis, or Meshopt compression** — the frontend only ever
  constructs a plain `GLTFLoader` (`Earth3DCanvas.tsx`, `terrain-loader.ts`);
  none of `DRACOLoader`, `KTX2Loader`, `MeshoptDecoder` exist anywhere in
  this codebase. A Draco/Meshopt/KTX2-compressed export will fail to parse
  at runtime even though `validateGlb` cannot detect it at upload time. Do
  not enable these exporters until the corresponding loader is added.
- Size ceiling: `MAX_MODEL_BYTES = 50 MB` (`lib/media/constants.ts`), checked
  at upload. Not being raised as part of this workflow (see Phase D notes);
  measure real export sizes against it first.

## Compatibility with existing overlay systems

These systems read state derived from the calibrated `Earth` object; they
have no separate configuration of their own and will automatically follow a
new, contract-compliant Earth model without code changes:

- **Country borders / highlights** (`country-borders.ts`,
  `country-highlight.ts`): fitted to `Earth`'s transformed bounding sphere at
  radius ×1.003 (borders) / ×1.0035 (highlight fill). The measurement
  explicitly excludes clouds, atmosphere, stars and companion bodies — only
  the `Earth` object's own geometry is measured. `borders.userData.earthRadius`
  (the derived runtime radius) is what markers, historical territories and
  terrain all read afterward — get `Earth`'s bounding sphere right and
  everything downstream inherits it.
- **Historical territories** (`historical-layer.ts`): reuses the same
  `country-highlight.ts` triangulator and the same `borders.userData.earthRadius`
  / `borders.position` — no independent geometry or radius.
- **Markers / timeline**: positioned via `latLngToVector3` in the same public
  frame; timeline logic (`chronology.ts`, `era-labels.ts`) is independent of
  the Earth mesh itself.
- **Terrain streaming** (`lib/terrain/*`, dev-only today): the terrain root
  transform (`terrain-alignment.ts`) and collision radius
  (`terrain-controller.ts`) are also derived from `borders.userData.earthRadius`
  and `borders.position`. Out of scope for this contract's changes — not
  touched by Phase B, and a contract-compliant Earth export requires no
  terrain-side changes for it to keep working when terrain is enabled.

## Out of scope

Terrain DEM/Sentinel-2 tile geometry and its own coordinate system
(`lib/visualizer/terrain-alignment.ts`'s AEQD projection contract), material
node graphs beyond the names above, and texture resolution/compression
policy are not covered here. `visualizer_models` does not yet store
`sha256`/`earthRadius`/`scale`/`orientationMode` fields — Phase D is expected
to add validation against this contract before upload, and may extend the
model metadata to record what was checked.
