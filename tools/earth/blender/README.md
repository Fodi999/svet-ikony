# Local Earth and Terrain Addon

Blender 5.2: 3D View > N-sidebar > Earth. Module: `earth_publish_addon`.

## Terrain Regions

- **Add Terrain Region** opens Name / West / East / South / North fields.
  It creates a collection with a `terrain_bounds` descriptor, not a generated
  mesh. Build is a separate explicit action. The dialog suggests an adjacent
  southern strip. Undo removes the added descriptor; the blend is never saved.
  Names are unique, up to 48 letters/numbers/spaces/underscores/hyphens.
  Bounds must align to longitude `6.70 + n*0.07` and latitude
  `45.75 + n*0.05`. Existing MontBlanc must remain unchanged. Patches must
  tile one rectangle without gaps/overlap, at most 256 cells per LOD.
  Grid dimensions and region IDs are now derived from descriptors, not names.
  This is an Alps workflow, not an arbitrary worldwide data downloader.
  Cached DEM/Sentinel must cover the new bbox; missing coverage fails safely
  and leaves the prior build intact. No automatic source download occurs.
- **Build Terrain Region** invokes `scripts/terrain/local_region.py build`.
  Collection bounds from `Terrain_Regions/Alps/*` are written to
  `build/region-request.json`. This uses the existing `generate_alps_dem.py` pipeline, local Copernicus
  DEM and local Sentinel TCI. No downloading or remote storage operations.
  The last L2 manifest supplies the TCI path; `ALPS_TCI_PATH` can override it.
- **Validate Terrain** invokes the project validator. It checks all configured
  tiles, L0/L1/L2 manifests, bounds, hashes, embedded image decoding,
  finite vertices, indices, native heights, explicit neighbors, same-LOD
  edges and mixed-LOD skirt coverage.

The current scene combines MontBlanc (6.70..6.98) and Alps_West_01
(6.42..6.70), both 45.75..45.95. The combined 8x4 grid has 96 tiles across
three LODs, with unchanged tile spacing. `region_name` and `region_tile_id`
identify each patch; x indices 0..3 are West and 4..7 are MontBlanc.
The direct spherical runtime sampler reads grid dimensions from manifests.
Lossless PNG textures preserve identical L2 join pixels. Build uses cached
sources only; `cache_alps_west_source.py` is a separate one-time preparation
command, never invoked by the addon build.
- **Preview Terrain** checks the local dev server and `EARTH_ASSET_MODE=local`.
  If unavailable, it starts `npm run earth:preview`. Existing servers are
  never stopped. It opens `/uk/pravoslavna-istoriya?terrainRegion=alps`.
  The local-only parameter selects France and moves to Mont Blanc terrain.

Tasks run outside Blender's UI thread. A single-task lock prevents overlap.
Logs are available through **Open Terrain Log**, under
`tools/terrain/alps/build/`. Adjust **Terrain Python** in addon preferences
to an interpreter with the dependencies in `scripts/terrain/requirements.txt`.

Builds stage and validate under `build/.staging-*` before replacing the
three LOD directories. Failed generation/validation leaves the previous
bundle intact. Replacement failures roll back. Do not reload preview
during the short directory replacement step. The legacy root manifest
remains the generator's regional template.

No Publish Terrain operator exists. This addon does not save the blend.
Production publication remains disabled. No R2/D1 writes.

Tests: run `python -B scripts/terrain/test_local_region.py` with the terrain
interpreter, after one successful build.
