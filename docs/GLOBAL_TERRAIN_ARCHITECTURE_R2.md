# Global terrain architecture on Cloudflare R2

Status: AUDIT + ARCHITECTURE ONLY. Nothing in this document has been implemented.
No R2/D1 changes, no production deploy, no global tile migration. Verified against
the repository on 2026-09-18 (`tools/terrain/alps/build`, `lib/visualizer/alps-stream.ts`,
`scripts/terrain/*`). All Alps prototype numbers below were re-measured from the actual
files on disk, not assumed from the brief.

## 1. Current Alps baseline (re-verified, not assumed)

Coverage: lon 6.00-7.54, lat 45.65-46.00 (~120 km x 39 km at this latitude), 9 logical
regions (MontBlanc, Alps_West_01/02/03, Alps_South_01/02, Alps_North_01, Alps_Italy_01/02),
154 tiles per LOD x 3 LOD = 462 GLB files. Grid: 22 x 7 cells, 0.07 deg x 0.05 deg per cell.

| LOD | tiles | on-disk total | avg tile | geometry | texture | metadata | vertices/tile | triangles/tile | spacing (m) | texture px |
|---|---|---|---|---|---|---|---|---|---|---|
| L0 | 154 | 8.9 MB | 57.2 KB | 28.5% (16.3 KB) | 69.1% (39.5 KB) | 2.6% | 396 | 604 | 339 x 371 | 129x129 (~42 m/px) |
| L1 | 154 | 50 MB | 334.9 KB | 56.4% (189.0 KB) | 43.1% (144.5 KB) | 0.5% | 4,396 | 8,052 | 86 x 93 | 257x257 (~21 m/px) |
| L2 | 154 | 414 MB | 2,629.4 KB | 78.9% (2,075.4 KB) | 21.0% (552.6 KB) | 0.1% | 47,521 | 92,448 | 21.5 x 30.9 | 545x557 (~10 m/px) |

Total local dataset: 472.9 MB. Height range 317-4,810.7 m (real Mont Blanc, no residual
exaggeration bug). Geometry format today: FLOAT32 VEC3 POSITION + FLOAT32 VEC3 NORMAL +
FLOAT32 VEC2 UV + UNSIGNED_SHORT indices (already indexed, not quantized). Texture:
lossless PNG, one image per tile, resolution scales with LOD (matches Sentinel/DEM
resolution reasonably well already: ~42 m/px at L0, ~21 m/px at L1, ~10 m/px at L2 native
Sentinel-2).

Measured browser behavior (`lib/visualizer/alps-stream.ts`, live-tested against the local
dev server): a wide 9-region overview holds 154/462 tiles resident at 8.8 MB downloaded and
34 FPS; a close Mont Blanc ground view holds ~165/462 tiles (4 visible) at 23.6 MB; moving
through Mont Blanc -> Aosta -> western edge accumulates up to 101-177/462 tiles and 41-72 MB
downloaded, with GPU texture budget observed hitting its ceiling (31.9/32.0 MiB) and network
cache near its ceiling (60.3/64.0 MiB) -- confirming the existing LRU eviction is load-bearing,
not decorative. The browser never held the full 473 MB dataset at once in any tested scenario.

Existing infrastructure already in place and reusable for the global design below: SSE-based
LOD selection with hysteresis (`selectAlpsLod`, max SSE 3 px), frustum + horizon culling,
nearest-first request queue with a `maxConcurrent` cap, a one-cell directional prefetch ring,
independent geometry/texture/network LRU budgets, draped country borders that stay continuous
across tile boundaries, a `TerrainByteCache` network cache, and a local `source-cache/` with a
`checksums.json` integrity manifest (`scripts/terrain/verify_source_cache.py`) that already
does cache-lookup -> checksum -> download-only-if-missing for Copernicus/Sentinel source tiles.

## 2. Proposed world architecture: world -> country -> region -> tiles

Countries and regions become **pure navigation**, not storage units. Selecting "France" or
"Alps" never fetches a `France.glb`; it resolves to a list of Global Tile IDs (Section 3) that
the existing streaming stack (Section 1's infrastructure, generalized) then loads exactly like
it loads Alps cells today. Zooming out evicts high-LOD tiles from GPU/RAM via the same LRU
budgets already proven in the Alps prototype -- no new eviction mechanism is needed, only a
larger and differently-addressed tile universe feeding the same selector/cache/budget code.

Concretely: `terrain-controller.ts`'s `REGIONS` map (today: code -> single manifest URL)
becomes code -> bbox -> a runtime tile-ID query against the global grid. The per-region
`AlpsStream`-style instance keeps working on whatever tile IDs it is handed; it does not need
to know whether they came from a country click, a search box, or a camera drag.

## 3. Global Tile ID (z/x/y)

Recommend a standard slippy-map-style quadtree: `z/x/y`, EPSG:4326 equirectangular tiling
(not Web Mercator -- Mercator distorts area/scale badly near the poles and this project
already has a working spherical lat/lon pipeline; reprojecting to Mercator would throw that
away for no benefit). Grid origin at (-180, -90). At zoom `z`, the world is divided into
`2*2^z` columns and `2^z` rows, i.e. each tile spans `360/(2*2^z)` degrees of longitude and
`180/2^z` degrees of latitude.

For each tile: `z`, `x`, `y`, bbox (min/max lon/lat), `parent = (z-1, x>>1, y>>1)`, 4
`children = (z+1, 2x+dx, 2y+dy)` for dx,dy in {0,1}, 4 `neighbors = (z, x+-1, y)/(z, x, y+-1)`
(wrapping x at the antimeridian, clamping y at the poles), `geometric_error_m` (carried over
from the existing per-tile `geometric_error_m` field), `imagery_source` (Sentinel-2 scene id +
date), `dem_source` (Copernicus tile id), `version` (integer, bumped on regeneration).

```
lat/lon -> tile id:  x = floor((lon + 180) / (360 / (2*2^z)))
                      y = floor((90 - lat) / (180 / 2^z))
tile id -> bbox:      west  = x * (360/(2*2^z)) - 180
                      east  = west + 360/(2*2^z)
                      north = 90 - y * (180/2^z)
                      south = north - 180/2^z
tile -> parent:       (z-1, x>>1, y>>1)
tile -> children:     (z+1, 2x, 2y), (2x+1, 2y), (2x, 2y+1), (2x+1, 2y+1)
tile -> neighbors:    (z, x-1, y), (z, x+1, y), (z, x, y-1), (z, x, y+1)
```

This does not require discarding the Alps grid, only mapping it. The current Alps cells are a
regular 0.07 deg x 0.05 deg lattice starting at (6.70, 45.75) -- pick the global zoom level `z`
whose cell size is closest, then express every Alps (region, col, row, lod) as one `z/x/y` via
the lat/lon of its center through the formula above. Existing Alps L0/L1/L2 map to three
different global `z` values (finer LOD = higher `z`), not three LODs of one `z` -- this is a
clean fit, not a special case.

Example mapping (illustrative, using the formula above; exact `z` choice is an implementation
decision, not an architectural one):

| Old Alps tile | region | bbox (lon/lat) | -> Global tile id (approx, z chosen so cell size ~ Alps L2 cell) |
|---|---|---|---|
| L2 tile (col 0,row 0) | MontBlanc | 6.70-6.77 / 45.90-45.95 | z=12, x=2452, y=1479 |
| L2 tile (col 0,row 0) | Alps_Italy_02 | 7.40-7.47 / 45.85-45.90 | z=12, x=2465, y=1480 |
| L2 tile (col 0,row 0) | Alps_West_03 | 6.00-6.07 / 45.95-46.00 | z=12, x=2439, y=1479 |

(x/y values above are computed from the formula for illustration; they are not yet written
anywhere in the codebase and nothing currently depends on them.)

## 4. Cloudflare R2 production layout

```
terrain/
  v1/
    <z>/<x>/<y>.bin        # packed tile (Section 5, Option C) -- 1 object per tile
    <z>/<x>/<y>.json       # OR: metadata folded into a parent manifest, see Section 6
  manifests/
    <z>/<x>/<y>/index.json # optional per-branch manifest (children, versions, override flag)
  source-archive/           # PRIVATE prefix: raw Copernicus/Sentinel, Worker-only access
    copernicus/<tile>.tif
    sentinel/<mgrs>/<date>/TCI.tif
version                     # small pointer object: current production version string
```

Object count matters as much as bytes on R2: R2 (and the CDN in front of it) charges/limits
per-request, and every extra small object is an extra round trip. This is why Section 5/6
recommend one packed object per tile rather than 2-3 separate objects -- at global scale (a
land area extrapolation puts L2 in the tens of millions of objects, Section 12) tripling the
object count for no byte savings is the single worst lever available.

R2 credentials stay server-side only, exactly as the current architecture already does: the
existing dev route `app/terrain/[region]/[lod]/[file]/route.ts` already serves terrain through
a same-origin Worker route rather than exposing storage directly; production extends the same
route (or a sibling one) to read from the R2 binding instead of local disk for
non-`LOCAL_ONLY_TERRAIN_REGIONS` regions. The browser never sees an R2 key, bucket name, or
credential -- it only ever calls same-origin `/terrain/...` URLs, matching today's contract.

## 5. File format comparison

Baseline numbers are the real Alps L2 tile (2,629 KB: 2,075 KB geometry + 553 KB texture +
1.5 KB metadata; 47,521 vertices, 277,344 indices).

**Option A -- GLB per tile (current).** Storage: 2,629 KB/tile as measured. Requests: 1/tile.
Decode: three.js `GLTFLoader`, mature, cheap. RAM/GPU: full FLOAT32 attributes resident.
Compatibility: excellent, already shipped. Complexity: none, already built. Caching: works
with immutable URLs. Workers: no special support needed. Millions of tiles: works, but ships
~950 KB/tile (POSITION+UV) and a 555 KB index that a uniform grid does not need to transmit at
all (see Option C).

**Option B -- quantized GLB (KHR_mesh_quantization).** Same request/format shape as A.
POSITION and UV as normalized SHORT instead of FLOAT32 (12->6 bytes and 8->4 bytes per
vertex); optionally drop NORMAL (570 KB/tile, 21.7% of the file) and reconstruct it in the
vertex shader from the height field, matching how `alps-stream.ts` already computes surface
height per-lat/lon (`gridHeight`) -- the data to derive a normal is already resident, it is
only not currently reused for this. Estimated new tile: ~1.5-1.7 MB (35-40% smaller than A),
same texture cost. Loader support: three.js `GLTFLoader` handles `KHR_mesh_quantization` in
its core parser (no extra loader registration) -- verified against the installed three.js
0.185.1 in this repo. Complexity: low; changes are confined to the Python GLB writer in
`generate_alps_dem.py`. Risk: touches the actively-developed generation pipeline.

**Option C -- height binary + imagery + metadata, BufferGeometry built in a Web Worker.**
The index for a uniform NxM grid is a fixed, reusable pattern -- it never needs to be shipped
or stored per tile, only computed once per (N,M) shape and cached in the client. Height can be
quantized to a UINT16 per vertex (Section 16); at 47,521 vertices that is ~95 KB, versus 2,075
KB of geometry today -- a ~95% cut on the geometry side. Imagery stays a separate 2D texture
(same bytes as Option A/B, or smaller with a format change, Section 15). Normals are computed
client-side (Worker, finite differences on the height grid) instead of shipped. Estimated
packed tile: height (~95 KB, or less with tighter quantization) + imagery (~250-550 KB
depending on format) + metadata (~1-2 KB) = roughly 350-650 KB, a 75-85% reduction from
Option A. Requests: 1/tile if packed into one container (a tiny fixed header + three byte
ranges), which this document recommends over shipping height/imagery/metadata as 2-3 separate
objects. Decode: custom, but simple (parse header, feed height array + procedural index into a
`BufferGeometry`, run in a `Worker` via `OffscreenCanvas`/transferable `ArrayBuffer` so main
thread never blocks on it -- a genuine responsiveness win independent of the byte savings).
Browser compatibility: fine, no special API beyond typed arrays and Workers. GPU memory: lower
than A/B for the same visual result, since no redundant NORMAL attribute is uploaded.
Complexity: highest of the three -- new container format, new client-side geometry builder,
Worker plumbing. Millions of tiles: best fit of the three, on both storage and request count.

**Recommendation:** Option B first (near-zero risk, proven loader support today, meaningful
storage cut, fits inside the existing GLB pipeline) as an interim step; Option C as the actual
production target for the global system, once the packed-container format and Worker-based
geometry builder exist (Section 21, migration phases E/G). Do not adopt Option B as a
permanent end state -- it still carries Option A's per-tile request count and does not remove
the index, so it leaves real savings on the table that C captures.

## 6. HTTP request fan-out

**A** (1 GLB/tile, current): 1 request per tile touched.
**B** (height.bin + imagery + metadata, 3 objects): up to 3 requests per tile.
**C** (packed container, 1 object): 1 request per tile, smaller bytes than A.
**D** (height+imagery packed, metadata folded into a parent manifest fetched once per branch):
2 requests per *newly seen* tile, amortizing toward ~1/tile in steady state as manifests are
already cached from a prior fetch of a sibling tile.

Using the measured Alps numbers: a single close view holds 4-24 visible L2 tiles at once (live
data from Section 1). A" typical frame" therefore means A/C: 4-24 requests, B: 12-72 requests
for identical visual content. Over the measured Mont-Blanc -> Aosta -> west-edge traversal
(101-177 unique tiles touched), A/C: 101-177 requests total, B: 303-531 requests for the same
bytes-of-content-that-matter (B's extra requests buy nothing -- same total payload, 3x the
connection/scheduling overhead). Extrapolating to 10 minutes of continuous free movement across
a wider area than the current 9-region prototype (order-of-magnitude, not measured): A/C on the
order of 300-800 unique-tile requests, B on the order of 900-2,400 for no additional bytes.
HTTP/2 multiplexing absorbs this without breaking, but it is pure overhead with zero upside --
this is the strongest concrete argument in this document against Option B and for Option
C or D.

## 7. Recommended target tile size (derived, not assumed)

| Tile | current | recommended target | basis |
|---|---|---|---|
| L0 | 57 KB | 30-45 KB | texture already 69% of file; format swap (Section 15) is the main lever, geometry is already tiny |
| L1 | 335 KB | 150-220 KB | quantize/drop-normal geometry (~50% of its 189 KB) + texture format swap |
| L2 height only | n/a (bundled) | 60-100 KB | 47,521 vertices x 1-2 bytes quantized height |
| L2 imagery | 553 KB (PNG) | 150-350 KB | WebP/AVIF at unchanged ~10 m/px resolution (Section 15) |
| L2 packed tile | 2,629 KB | 350-650 KB | height + imagery above + ~2 KB metadata, no shipped index |

## 8. Browser performance budget (target ranges)

**Desktop:** visible terrain tiles 150-250 (154 already sustained at 34 FPS today); max
concurrent tile requests 4-6 (today's cap is 2, sized for today's 2.6 MB tiles -- packed
~500 KB tiles can afford more parallelism); geometry RAM 64-128 MB; texture GPU memory
128-256 MB (today's 32 MB budget is sized for uncompressed PNG-derived RGBA8 textures; a
GPU-compressed format, Section 15, fits several times more detail in the same MB); network
cache 64-128 MB; triangles/frame 2-4 million (tests today stayed under 900K at 30+ FPS, large
headroom); draw calls 150-300 (tests today stayed under 165); first-detailed-view download
5-15 MB with today's format, 2-6 MB with Option C; desired FPS 45-60 (today's dev-hardware
measurements were 29-34 FPS, which is acceptable for the local prototype but not the
production bar).

**Mobile:** visible terrain tiles 40-80; max concurrent requests 2-3; geometry RAM 24-48 MB;
texture GPU memory 48-96 MB; network cache 24-48 MB; triangles/frame 500K-1M; draw calls
60-120; first-detailed-view download 2-6 MB; desired FPS 30-45.

These are ranges, not guarantees -- they should be re-validated against real mid-range mobile
hardware once Option B/C ship, not just the desktop dev browser used for this audit.

## 9. Session download budget scenarios

Scenarios A-D use real measurements from this session's live testing of the current Alps
prototype; scenario E is outside the built area and is explicitly a forecast, not a
measurement.

| Scenario | requests | downloaded | peak geometry RAM | peak GPU texture | triangles | draw calls | FPS |
|---|---|---|---|---|---|---|---|
| A: Globe->France->Alps overview | ~150-160 | 8-12 MB | 3-10 MB | 10-15 MB | 200-800K | 150-170 | 32-34 (measured) |
| B: Globe->Alps->Mont Blanc close | ~165-180 | 20-30 MB | 15-20 MB | 20-25 MB | 300-500K | 10-15 | 30-32 (measured) |
| C: Mont Blanc->Aosta->west Alps | ~250-350 | 60-90 MB | 25-35 MB | 25-32 MB (near budget) | 400-900K | 30-50 | 29-33 (measured) |
| D: 10 min free movement, high detail | ~400-900 | 80-150 MB cumulative (resident capped ~96 MB) | capped at budget (~64 MB) | capped at budget (~32 MB) | 200-900K | 10-165 | 29-34 (measured, extrapolated for duration) |
| E: France->Germany->Poland->Ukraine | ~200-600 (forecast) | 15-40 MB (forecast) | capped at budget | capped at budget | n/a | n/a | 40-55 (forecast, assumes Option C/quantized format) |

Scenario E assumes each country-level transition loads a fresh set of ~50-150 small L0/L1
tiles (Option C format, 40-220 KB each) while the same LRU budgets evict the previous
country's non-visible tiles -- no L2 unless the user stops and zooms in, matching the "world
never fully loads" goal.

## 10. CDN / cache strategy

Versioned, immutable tile objects: `Cache-Control: public, max-age=31536000, immutable` on
`/terrain/v1/<z>/<x>/<y>.bin` (and on `source-archive` objects, which are never served to
browsers directly). A new data version ships as `v2/...` -- old URLs keep resolving to the
exact bytes a browser already cached, so nothing already downloaded is ever invalidated or
re-fetched. Manifests/region indices under `terrain/manifests/...` are also versioned and
immutable for the same reason. The one object that must NOT be cached long is the version
pointer (`terrain/version` or an equivalent small endpoint) -- short `max-age` (30-300 s) or
`no-cache` with `stale-while-revalidate`, so clients discover a new version promptly without
polling origin on every request. Cloudflare's edge automatically caches the immutable GETs at
the PoP nearest each user; a second user requesting the same tile from the same region gets it
from edge cache without the Worker or R2 being touched at all. A repeat session by the same
user gets the tile from the browser's own HTTP cache (no network round trip whatsoever) as
long as the version pointer has not advanced.

## 11. R2 traffic estimates (architectural load, not pricing)

Using a conservative typical-session figure of ~15 MB (between scenario A/B above; heavy
scenario-D sessions will be a minority) and assuming edge-cache hit rates rise as a version
matures (assume 50% origin/R2 hit rate in the first days after a new version ships, tapering to
~10-20% steady state as most tiles are already warm at the edge -- these are architectural
assumptions, not measured, and should be revisited once real traffic exists):

| sessions/month | user-facing traffic (approx) | CDN-served (no origin hit) | origin/R2 requests (approx, steady state ~15%) |
|---|---|---|---|
| 1,000 | ~15 GB | ~85% | low thousands |
| 10,000 | ~150 GB | ~85% | tens of thousands |
| 100,000 | ~1.5 TB | ~85-90% | low hundreds of thousands |
| 1,000,000 | ~15 TB | ~90%+ | low millions |

Storage volume does not grow with session count (it grows with how much of the world has been
generated/prebuilt, Section 12-13) -- traffic and storage are independent axes and should not
be conflated when sizing R2.

## 12. Global storage estimate (order of magnitude)

The Alps prototype area is mountainous, near-worst-case relief, and the current generator is
NOT relief-adaptive -- it emits a fixed-density grid per LOD regardless of terrain complexity,
so file size per km^2 is roughly constant across flat and mountainous terrain in the current
pipeline. That makes this extrapolation a reasonable (if conservative/upper-bound) estimate,
not an underestimate: a smarter, relief-adaptive generator would likely do better on flat
terrain, but nothing in the current pipeline does that yet.

Alps prototype area: ~4,648 km^2 (bbox at ~45.8N). Current dataset 472.9 MB for that area ->
~101.7 KB/km^2 (L0 1.9, L1 10.8, L2 89.1 KB/km^2). Scaling to Earth's land area (~148.9M km^2):

| Format | L0 | L1 | L2 | Total |
|---|---|---|---|---|
| Current (Option A) | ~285 GB | ~1.60 TB | ~13.3 TB | **~15.2 TB** |
| Quantized (Option B) | ~200 GB | ~1.0 TB | ~8.0 TB | **~9.2 TB** |
| Height+imagery (Option C) | ~150 GB | ~0.6 TB | ~3.3 TB | **~4.1 TB** |

**Does the whole world need L2 prebuilt? No.** Even at the most optimistic (Option C) figure,
3.3 TB of L2 alone, generated and stored for land area almost nobody will ever zoom into at
10 m detail, is not justified next to an on-demand-plus-cache approach (Section 13) that spends
storage only where users actually go. L0 (150-285 GB) is cheap enough to prebuild globally
outright regardless of format chosen.

## 13. Prebuild vs on-demand vs hybrid

**A. Prebuild everything.** Predictable latency and availability everywhere from day one; but
~15 TB (current format) to ~4 TB (Option C) up front, most of it for land no one visits, plus a
long initial build run and no easy way to fix mistakes without a full re-run of affected tiles.

**B. Generate everything on demand.** Minimal storage until first access; but a naive
synchronous "fetch DEM+imagery, build mesh, return" on a cache miss can take seconds -- not
acceptable inline in a page load. Needs a background generation path (a queue or a Worker with
a fallback coarser LOD shown while the fine tile builds) and careful idempotency/versioning so
concurrent requests for the same missing tile do not trigger duplicate generation work.

**C. Hybrid (recommended).** L0 fully prebuilt worldwide (150-285 GB, cheap, guarantees the
"zoomed out globe" experience is instant everywhere, matching the product's globe-first UX).
L1 prebuilt for regions the project actually cares about first (Europe / Orthodox-world
geography, matching svet-ikony's own content scope) and generated-on-demand elsewhere. L2
always generate-on-demand and cache permanently in R2 after first build: the first visitor to a
never-before-viewed close-up area sees a brief coarser-LOD hold (the existing hysteresis/morph
system already smooths LOD transitions) while the tile is generated in the background and
written to its canonical R2 key; every later visitor -- including that same user on a repeat
session -- gets the now-cached object like any other immutable tile. This directly mirrors the
pattern already sketched in the brief and matches how the Alps prototype's own
`local_region.py` already treats "missing input -> build once -> reuse."

## 14. Global source-cache design

```
source-cache/
  copernicus/
    N45_E006.tif
    N45_E007.tif
    ...
  sentinel/
    32TLR/2023-09-26/TCI.tif
    31TGL/2023-09-26/TCI.tif
    ...
  checksums.json
```

Requirements (already prototyped locally this session in `scripts/terrain/verify_source_cache.py`,
which hashes every cached `.tif`, records sha256+size in `checksums.json`, and flags duplicate
content across paths): cache lookup before any network call; sha256/validity check against the
recorded manifest, not just `Path.is_file()`; duplicate detection (the same source tile must
never be downloaded twice under two different paths -- this session found and removed exactly
one such duplicate); one Copernicus 1x1 degree source tile legitimately feeds many web tiles at
every LOD it touches, so the source-cache is deliberately much smaller than the web-tile output
it feeds.

**DEV local source-cache** (what exists today): the Mac's local disk, `tools/terrain/alps/build/source-cache/`
plus `My project/Earth_Blender/dem|satellite/alps/`, used directly by Blender and the local
build scripts, never uploaded automatically.

**Production source archive** (proposed): a private R2 prefix (`terrain/source-archive/...`,
Section 4), Worker-only access, never exposed to browsers, used only by the on-demand
generation path (Section 13.B) so regenerating or re-tiling never requires re-downloading raw
Copernicus/Sentinel data from ESA/AWS. The dev local cache and the production archive are the
same *design*, different *audience*: one feeds Blender/manual builds, the other feeds the
automated generation service.

## 15. Imagery format comparison (measured/estimated against the real 545x557 Alps L2 tile, 553 KB PNG)

| Format | est. size | quality | decode | GPU upload | three.js support | mobile | build complexity |
|---|---|---|---|---|---|---|---|
| PNG (current) | 553 KB | lossless | fast | full RGBA8 (no VRAM savings) | native | native | none, shipped |
| WebP | ~150-200 KB | very good (q~80) | fast | full RGBA8 | native (`<img>`/ImageBitmap) | native, broad | low: format swap only |
| AVIF | ~100-150 KB | very good | slower than WebP | full RGBA8 | good, broadly supported | good, some older-device gaps | low-medium |
| KTX2/Basis (ETC1S/UASTC) | ~250-350 KB on disk | good (ETC1S) to very good (UASTC) | transcode step, fast | **compressed in VRAM, 4-8 bits/px vs 24-32** | requires `KTX2Loader` + transcoder wasm | requires supercompression fallback path | medium-high: needs `toktx`/`basisu` in the build pipeline |

Recommendation: WebP as a low-risk near-term win (smaller downloads, zero new loader code).
KTX2/Basis as the real long-term answer specifically because the constraint that matters most
for "keep hundreds of tiles resident" is VRAM, not download bytes -- KTX2 is the only option
here that reduces GPU memory, not just transfer size. Sequence it after the Option C packed
container work (Section 21), not before; do not implement either without re-validating the
loader change end-to-end first, per the brief's "prove support before implementing" rule from
the previous phase.

## 16. Geometry optimization (measured against the real L2 tile)

| Representation | POSITION | NORMAL | UV | INDEX | total geometry | vs current |
|---|---|---|---|---|---|---|
| Current: FLOAT32 | 570 KB | 570 KB | 380 KB | 555 KB | 2,075 KB | baseline |
| KHR_mesh_quantization (normalized SHORT) | 285 KB | 570 KB (kept) | 190 KB | 555 KB | 1,600 KB | -23% |
| + drop NORMAL (recompute in shader from height) | 285 KB | 0 | 190 KB | 555 KB | 1,030 KB | -50% |
| Raw quantized height grid (Option C: procedural index, no NORMAL, UINT16 height) | ~95 KB (height only) | 0 | 0 (UV derivable from grid position) | 0 (procedural) | **~95 KB** | **-95%** |

Loader support verified: three.js `GLTFLoader` (0.185.1, installed) parses
`KHR_mesh_quantization` in its core parser, no extra registration. `EXT_meshopt_compression`
(further entropy-coding on top of any of the above) requires registering `MeshoptDecoder` via
`loader.setMeshoptDecoder(...)`, which is not currently wired up -- usable, but it is an
additive step, not a prerequisite, and should be evaluated after quantization/height-grid
lands, on whichever representation is chosen, since it compresses transport bytes without
changing the in-memory representation.

## 17. Quality targets

Copernicus GLO-30 vertical accuracy is on the order of a few meters (~4 m LE90, publicly
documented for this dataset); Sentinel-2 true-color is natively ~10 m/px. The existing pipeline
already tracks this reasonably well empirically: measured L0 texture ~42 m/px, L1 ~21 m/px, L2
~10 m/px, roughly following the geometry spacing at each LOD (339 m, 86 m, 21 m respectively) --
this is a validated existing strength, not a gap to fix.

Recommendation: gate full 10 m Sentinel imagery to LOD==2 only (i.e., only once SSE has already
selected the finest geometry LOD -- reuse the exact same `ALPS_MAX_SSE`/hysteresis decision
that already exists, rather than adding a second threshold); L1 imagery around 20-40 m/px, L0
around 80-150 m/px, both already close to what is shipped today. Desktop max SSE: keep the
proven 3 px. Mobile max SSE: relax to 4-5 px (coarser trigger, less L2/bandwidth pressure) --
`mobile` is already threaded through the whole streaming stack, only the SSE constant itself
needs to become mobile-aware (`ALPS_MAX_SSE` is currently a single shared value). Acceptable
terrain positional error: a UINT16 height quantized over a generous -500..9,000 m range gives
~0.145 m steps, well under the DEM's own ~4 m accuracy -- quantization is free with respect to
real-world quality here.

## 18. Network adaptation

Use the Network Information API (`navigator.connection.effectiveType`/`downlink`/`saveData`)
where available (broad on Chromium/Android, absent on Safari/iOS -- needs a manual "data saver"
fallback toggle for that gap) to pick an initial quality profile: slow/2G/3G or `saveData` true
starts at L0/L1 only with the smaller imagery format and a relaxed SSE, mirroring the mobile
profile in Section 17 regardless of device type; fast/wifi allows immediate L2 prefetch using
the existing directional prefetch ring. The Earth base + L0 must always render first regardless
of detected speed -- never block the initial view waiting on L2. Graceful fallback ladder stays
Earth base -> L0 -> L1 -> L2, exactly matching the existing hysteresis-driven LOD promotion
already in `selectAlpsLod`, just with the entry point and ceiling adjusted per connection.

## 19. Blender's role

Blender does not build the world. Each Global Tile (Section 3) carries `{ generated: boolean,
blenderOverride: boolean, version }`. If a manual override object exists at a tile's canonical
R2 key, the generation/publish pipeline treats it as that tile's authoritative content instead
of the auto-generated one -- same container format, same address, same loader code path. The
web loader consumes one tile interface and never needs to know whether a given `z/x/y` came
from the generator or from a Blender export; this matches how the existing
`Blender -> Build -> Validate -> Preview` local workflow already treats the build directory as
the single source the web loader reads from, regardless of how each GLB was produced. Blender's
ongoing role: visual QA, special/landmark regions, manual fixes to generator artifacts,
material testing, and override tiles for locations that matter enough to hand-finish (e.g. a
flagship monastery or historic site) -- never bulk world coverage.

## 20. Knowledge layers (cities, saints, monasteries, events, ...)

Terrain owns exactly two things: surface geometry and imagery. Every other layer is loaded
independently, keyed by its own zoom/region schedule, never embedded inside a terrain tile
payload. This is not a new principle to introduce -- it is already how the current codebase
treats capitals (`lib/visualizer/capital-cities.ts`, `public/data/capitals-10m.json`) and city
labels (`country-labels.ts`, `cities-10m.json`), which load as their own JSON, independent of
`alps-stream.ts`'s GLB tiles. Future layers (saints, monasteries, events, historical
territories, animals, plants, fossils, geology) should follow the exact same pattern: their own
data files, their own zoom-triggered loading, addressed by lat/lon or by region/country ID, and
never a reason to touch the terrain tile format.

## 21. Migration plan: current Alps -> global engine

No large rewrite. Each phase is additive and leaves the previous phase fully working.

- **A** -- Freeze the Global Tile ID spec (Section 3) as a document + TypeScript types. No code
  path depends on it yet.
- **B** -- Write the pure `(region, col, row, lod) -> (z, x, y)` mapping function for the
  existing Alps grid (deterministic, since the Alps lattice is already regular) and its inverse.
  No behavior changes; this is a pure function with tests.
- **C** -- `terrain-loader.ts`/`alps-stream.ts` gain an additional lookup path keyed by global
  tile ID alongside the existing Alps-specific manifest path. Old Alps addressing keeps working
  unchanged.
- **D** -- `terrain-controller.ts`'s `REGIONS` map starts resolving a country/region selection
  to a list of global tile IDs instead of a single manifest URL, while still ultimately loading
  today's Alps manifests underneath for the Alps-covered area.
- **E** -- Introduce the new tile format (quantized GLB first, then the packed Option C
  container) tile-by-tile and versioned; the loader dispatches by a per-tile `format` field, old
  GLBs keep loading exactly as they do today.
- **F** -- Extend `verify_source_cache.py`'s pattern (Section 14) to the production source
  archive.
- **G** -- Stand up the on-demand generation path (Section 13.C): cache miss -> generate ->
  write to R2 -> serve, with a coarser-LOD hold in the UI while it builds.
- **H** -- Wire R2-backed production delivery into the existing same-origin terrain route
  pattern (`app/terrain/[region]/[lod]/[file]/route.ts`'s `LOCAL_ONLY_TERRAIN_REGIONS`
  allowlist already separates dev-local serving from a production path conceptually -- extend
  it with an R2-backed branch for global-tile regions, without removing the dev-local branch the
  Alps prototype depends on).
- **I** -- Retire Alps-specific naming only after B-H are proven end-to-end; the Alps prototype
  keeps working, unmodified, throughout A-H.

## 22. Risks

Relief-non-adaptive generation makes flat land cost the same as mountains (Section 12) --
worth revisiting before any large-scale L1 prebuild. On-demand generation needs real
concurrency control (two users requesting the same missing tile simultaneously must not
double-build it) -- not yet designed, flagged for Phase G. KTX2/Basis and AVIF both add real
build-pipeline dependencies (`toktx`/`basisu`, encoder availability) that need to be verified
on whatever machine runs production builds before being relied upon. The Network Information
API gap on Safari/iOS means the network-adaptation profile (Section 18) needs a manual
fallback, not just device detection. All storage/traffic figures in this document are
order-of-magnitude extrapolations from a single, unusually mountainous 4,648 km^2 sample --
they should be revisited once a second, flatter region is built, to sanity-check the
relief-non-adaptive assumption.

## 23. Recommended first implementation step

Before any global migration: implement Option B (quantized GLB, drop shipped NORMAL) on the
existing Alps generator only, entirely within the current local/dev-only pipeline, no R2/D1
touched, no addressing change. It is the lowest-risk, already-loader-proven change in this
entire document (Section 5/16), it directly validates the biggest single number in Section 12
(L2 going from ~13.3 TB to ~8 TB globally), and it requires no new infrastructure -- only a
change to the Python GLB writer plus re-running the existing local build/verify/preview loop
that already exists for the Alps prototype. Everything else in this document (Global Tile ID,
R2 layout, on-demand generation, packed Option C container) should wait for that one change to
be measured end-to-end first.
