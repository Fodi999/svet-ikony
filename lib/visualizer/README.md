`land-outlines.json` contains polygon rings from Natural Earth's 1:110m land
dataset, rounded to three decimal places. It contains coastlines, not political
boundaries. The globe uses these bundled coordinates without external requests.

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson

License: public domain — https://www.naturalearthdata.com/about/terms-of-use/

Country borders use Natural Earth 1:50m Admin 0 Countries, pinned to the
natural-earth-vector v5.1.2 release:
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson

Upstream SHA-256: `3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb`.
License: public domain. Dataset documentation:
https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/

Natural Earth uses its default de facto boundary convention. This is a pinned
cartographic dataset, not a live or universally agreed political-boundary feed.
No country boundaries have been hand-edited. Coastlines are included because
country polygons contain both land borders and coastal rings.

Reproduce `public/data/country-borders-50m.geojson` with:
`node scripts/prepare-country-borders.mjs /path/to/ne_50m_admin_0_countries.geojson`.
Only properties are reduced and coordinates rounded to 0.001 degrees; every
Polygon/MultiPolygon ring is retained. 242 features, 1,632 rings, 1,688,708 bytes
(570,586 bytes gzip). No GIS package or runtime third-party request is needed.

`geography.ts` owns the shared north +Y / Greenwich +Z / east +X conversion.
`prepareBaseScene` already calibrates GLB longitude with its geographic anchors;
do not apply that yaw twice to country coordinates. `country-borders.ts` builds
one unit-sphere LineSegments object, removes identical shared edges, and splits
long arcs into at most 1° segments, including antimeridian crossings. The layer
is fitted to the solid Earth mesh's transformed bounding sphere at radius ×1.003.
Clouds, atmosphere, stars and companion bodies are excluded from that measurement.

The overlay frame follows `currentEarthMatrix * inverse(restEarthMatrix)` just
like event pins. It preserves GLB animation and all parent transforms without
regenerating geometry. 78,720 segments / 157,440 vertices / 1,889,280 GPU position
bytes / one extra draw call. The page-lifetime fetch Promise is shared; GPU
resources belong to their canvas and are disposed on unmount. The borders toggle
changes visibility only. Development calibration points and FPS/draw diagnostics
are stripped from production UI; marker geometry is created only in development.

Standalone HQ/optimized Earth exports declare their source axes in the Earth
mesh's `gltf_axes` extras instead of embedding geographic anchor nodes.
`prepareBaseScene` reads that explicit north +Y / Greenwich +X / east −Z frame
and applies the same −90° normalization, accounting for initial world rotation.
Unknown uploads retain the existing zero-offset fallback; filenames are not used
for calibration. See `HQ_CALIBRATION_FIX.md` for the actual HQ UV/render checks.


Country interaction reuses those exact geometry coordinates. Run
`node scripts/prepare-country-interaction.mjs countries.geojson places.geojson`
to regenerate both the country properties (`code`) and lightweight metadata.
The older border-only generator also retains ISO keys.
The second input is Natural Earth v5.1.2 1:50m populated places:
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_populated_places.geojson
SHA-256: `da4662b7bbfeb897d02f228c5839131dce27acff5717630f91ccff4f67828ee7`.
Capitals use ADM0CAP=1, joined by ADM0_A3; CAPALT-only cities are not called capitals.
Missing capital metadata remains null. Country/capital names use NAME_UK/RU/EN
with the source English name as fallback. No geometry is stored in metadata.

239 source features have ISO_A2_EH/ISO_A3_EH keys. Kosovo uses the source's
user-assigned XK convention. Somaliland, Northern Cyprus and Siachen Glacier
have neither key and remain visible in the unchanged border layer but are not
selectable; no invented identifiers are assigned.

`countries.ts` caches polygon preprocessing in a WeakMap. Each polygon has an
unwrapped longitude interval, bbox and hole-aware ray crossing. Hover runs only
on pointer events (at most 40 Hz), after bbox filtering. `country-camera.ts`
raycasts the solid Earth and inverts the existing geographic overlay frame.
Country fly-to follows a one-second spherical arc, fits the main polygon's
angular extent using the limiting viewport FOV and preserves OrbitControls limits.

`country-highlight.ts` triangulates the existing polygons with holes, subdivides
long edges to 1 degree, and projects triangles onto the globe at radius x1.0035.
Fill/outline/anchor depth-test against Earth. Fill is 0.16 hover / 0.23 selected;
single-pass double-sided fill adds one draw, outline one, anchor one. At most four
country GPU layers are cached; old layers and all canvas-owned resources are
disposed. Highlight visibility is independent from the general borders toggle.

`country-interaction.ts` owns pointer lifecycle, hover, selection and cancelable
camera transitions. Drag threshold is 6 CSS pixels. Any two-pointer gesture
suppresses selection until all pointers release. A normal next tap works.
The real HTML CountryPanel reuses the right column / mobile bottom sheet and
provides keyboard selection and close/reset. `getCountryContent(code)` is a
future seam returning unavailable/null values; it performs no D1 query and
changes no schema. See `COUNTRY_INTERACTION_REPORT.md` for browser evidence.


Level 0 polish keeps the existing ISO selection and camera through locale
navigation. Country labels use the current locale getter; refreshTooltip updates
text and measured placement without raycasting, rebuilding highlights or flying
the camera. Long labels wrap within the canvas; tooltip placement flips below
near the top edge and clamps both axes with an 8px inset. A pressed pointer keeps
the grabbing cursor, secondary clicks do not select countries, and mouse hover
recovers after all pinch pointers release. See `LEVEL_0_POLISH_REPORT.md`.
