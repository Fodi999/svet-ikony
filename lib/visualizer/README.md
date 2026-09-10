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
Polygon/MultiPolygon ring is retained. 242 features, 1,632 rings, 1,673,711 bytes
(563,594 bytes gzip). No GIS package or runtime third-party request is needed.

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
