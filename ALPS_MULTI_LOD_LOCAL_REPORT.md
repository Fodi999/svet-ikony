# Alps multi-LOD local terrain

Rendering verification below was incomplete: later oblique/continent views
exposed depth and elevated-border artifacts. See `ALPS_SPHERICAL_LOCAL_FIX.md`
for the subsequent corrections, expanded checks and remaining data limits.

Verified locally on 2026-09-17. Preview: http://localhost:3000/uk/pravoslavna-istoriya

## Height investigation

The 7686.335911 m maximum was not a real DEM outlier. Blender's live
`Earth_Tile_Manager_Script` uses `SPHERE_RADIUS = 2`,
`SCALE_K = 2 / 6371000`, and `EXAGGERATION = 1.6`. Its radial positions
therefore encode exaggerated heights. The previous web exporter copied
raycast-derived heights without removing the baked exaggeration.

Across 17,424 saved raycast samples, median raycast/DEM ratio is
1.5999992634. A fresh object-specific Blender raycast at the old maximum
hits `Alps_TileMesh_12`, surface face 15458, at 7686.340356 m. Its normal's
radial dot product is 0.931: this is the summit surface, not a skirt or a
different object. At the same coordinate, interpolated DEM is 4804.053192 m.
The ~0.005 m difference between old and fresh raycasts is numerical precision.

| Dataset | Min m | Median m | p95 m | p99 m | Max m |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original DEM in bbox, 727489 samples | 562.500 | 2130.846 | 3585.406 | 4156.630 | 4810.717 |
| Saved raycasts, 17424 samples | 412.610 | 3413.775 | 5740.893 | 6644.903 | 7686.336 |

DEM maximum: longitude 6.8647222222, latitude 45.8327777778.
Old raycast maximum: longitude 6.8640625, latitude 45.8328125.

Dividing old samples by 1.6 is insufficient: residual RMSE is 31.648 m,
p99 absolute residual 10.609 m, with extreme negative residuals up to
1871.440 m at the outer bbox edges. The prototype has radial skirt faces
extending to radius 1.994. Historical bad edge hits cannot be conclusively
reconstructed from the saved JSON, which does not record object/face IDs.
Current edge raycasts do not reproduce those historical low hits. No claim
is made that every residual came from a skirt. Native generation bypasses
this entire raycast/skirt/interpolation uncertainty rather than clamping it.

The GeoTIFF is WGS84 PixelIsPoint with 1/3600 degree spacing. Sampling uses
the tagged point coordinates without an erroneous half-pixel offset.
All output surface heights come directly from this local DEM; exaggeration
is 1.0. Native L2 retains the source lattice. Coarser levels use triangle
interpolation. GLB surface heights agree with manifests within 0.01 m.

## Generated levels

| LOD | Tiles | East/north spacing m | Surface vertices per tile | Surface triangles total | Max measured error vs native DEM m |
| --- | ---: | --- | --- | ---: | ---: |
| L0 | 16 | 338.85 / 370.65 | 17 x 16 | 7680 | 315.743 |
| L1 | 16 | 86.06 / 92.66 | 64 x 61 | 120960 | 79.156 |
| L2 | 16 | 21.51 / 30.89 | 253 x 181 | 1451520 | 0 |

Files are in `tools/terrain/alps/build/L0`, `L1`, and `L2`.
The previous flat `build/manifest.json` and its GLBs remain unchanged as
the original L1 reference. Served L1 now uses corrected native DEM heights.
L2 includes a 1009 x 721 float32 collision grid in `heights.bin`.

SSE uses measured geometric error, camera-to-tile bounds distance,
effective vertical FOV and CSS viewport height. Refine above 3 px;
coarsen below 3/1.35 px. L2 error zero means no simplification relative
to this DEM, not zero uncertainty in real-world terrain.

Loading is frustum-selected per geographic cell, with a lower-resolution
fallback retained until the replacement is decoded. Desktop/mobile decode
concurrency is 2/1. Compressed byte cache is capped at 64 MiB; retained GPU
data is budgeted at 96/48 MiB, with hidden data evicted after 15 seconds.
Visible required data is not discarded merely to meet a cache budget.
Refinement geometry morphs over 0.25 seconds. Country selection and fly-to
continue to support FR, CH and IT; country border geometry is unchanged.

## Textures

Following explicit permission in the follow-up, downloaded the original
Sentinel-2A 32TLR TCI COG dated 2023-09-26, 343619757 bytes:
https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/32/T/LR/2023/9/S2A_32TLR_20230926_0_L2A/TCI.tif

Local original: `/Users/dmitrijfomin/Desktop/CodexWorkspace/Sentinel2_32TLR_20230926_TCI.tif`.
No DEM was downloaded. Generation reprojects this local COG to each tile's
geographic bbox. L0/L1/L2 textures are 129x129, 257x257 and 545x557.
L2 is approximately 10 m/pixel, not an enlarged 1024x1024 regional image.

## Measurements

Steady-state samples from the local in-app browser, not a hardware guarantee.
Texture memory below includes RGBA and a mipmap estimate for resident terrain
textures, excluding the base globe. Counts include skirts unless stated.

| View | Radial clearance m | Altitude m | L0/L1/L2 visible | Terrain triangles | Texture MiB | FPS |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Globe before terrain | n/a | ~14850200 | 0/0/0 | 0 | 0 | 60 |
| Regional preview | 500000 | 504810.67 | 16/0/0 | 9664 | 1.35 | 60 |
| Medium | 20000 | 24810.67 | 0/16/0 | 128832 | 5.38 | 60 |
| Close, desktop | 1000 | 5810.67 | 0/0/4 | 369792 | 6.18 | 60 |
| Summit, desktop | 10 | 4820.67 | 0/0/4 | 369792 | 6.18 | 60 |
| Close, 390x844 viewport | 1000 | 5810.67 | 0/0/2 | 184896 | 3.09 | ~60 |

Camera collision uses native local heights and visible coarser surface
heights, including the coarser surface during refinement. Radial clearance
is 10 m and near clipping is 0.2 m. A nearest-triangle calculation at the
10 m summit camera position gives actual Euclidean clearance 9.957886 m.
This is a measured summit clearance, not a universal lower bound for every
possible steep slope. At this distance the source texture/DEM resolution,
not camera zoom, limits visible detail.

## Edges and validation

All same-LOD GLB boundary positions match exactly (measured gap 0 m).
Maximum measured boundary height differences are 154.221 m for L0/L1,
44.311 m for L1/L2 and 154.221 m for L0/L2. The 1000 m skirts cover these
differences with ~1.9% extra geometry at L2. Surface extrema and collision
exclude skirt vertices. No holes or black seam bands were observed in the
tested views. Refinement morphing reduces geometric popping; texture detail
still changes at LOD swaps, and this is not a claim of fully imperceptible
transitions at every camera angle.

26 focused Vitest tests passed. TypeScript and targeted ESLint checks passed.
`verify_alps_dem.py` checked all 48 GLB hashes, sizes, elevations and edges.
Desktop and mobile-sized screenshots were inspected. Explicit framebuffer
probes found nine distinct nonzero RGBA colors in both desktop (1400x1068)
and mobile (390x527) canvases. Browser shader/error
logs were empty during final desktop L2 verification. FR, CH and IT were
each exercised through the country selector and Alps views.

## Reproduce locally

Use a Python environment containing `scripts/terrain/requirements.txt`.
The environment prepared for this session is
`/Users/dmitrijfomin/Desktop/CodexWorkspace/.alps-venv`.

```sh
ALPS_TCI_PATH=/Users/dmitrijfomin/Desktop/CodexWorkspace/Sentinel2_32TLR_20230926_TCI.tif /Users/dmitrijfomin/Desktop/CodexWorkspace/.alps-venv/bin/python scripts/terrain/generate_alps_dem.py
/Users/dmitrijfomin/Desktop/CodexWorkspace/.alps-venv/bin/python scripts/terrain/audit_alps_heights.py
/Users/dmitrijfomin/Desktop/CodexWorkspace/.alps-venv/bin/python scripts/terrain/verify_alps_dem.py
npx vitest run lib/visualizer/alps-stream.test.ts lib/visualizer/terrain-controller.test.ts lib/visualizer/terrain-frontend.test.ts lib/visualizer/terrain-stream.test.ts
npx tsc --noEmit --incremental false
```

No upload, publish, set-base-earth, R2 write or D1 write was performed.
Local L0 support is opt-in in parsing and does not enable L0 in the
production terrain storage contract.

ALPS MULTI-LOD LOCAL TERRAIN = WORKING
R2/D1 = UNTOUCHED
