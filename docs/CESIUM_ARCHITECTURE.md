# Cesium local architecture

> **Update:** the calendar globe (`/pravoslavna-istoriya`) now streams ion imagery/terrain/buildings; see "Streamed real Earth" in `UNIFIED_GLOBE.md`. The same-origin-only rules below still apply to the legacy/self-hosted path.

## Runtime choice

Use @cesium/engine and its CesiumWidget, not Viewer or @cesium/widgets.
CesiumWidget owns rendering/camera; the site owns UI. Engine includes terrain,
imagery, primitives, data sources, glTF and Cesium3DTileset. No standard search,
timeline, home, mode selector or animation widgets are required.
Reference: https://cesium.com/learn/cesiumjs/ref-doc/CesiumWidget.html

Mandatory initialization: baseLayer=false, explicit EllipsoidTerrainProvider,
then explicit same-origin imagery/terrain. Never call fromIonAssetId,
createWorldTerrainAsync, createWorldImageryAsync, IonResource or geocoders.
Serve Workers, Assets, ThirdParty and widget CSS locally; preserve licenses and credits.
Do not assume package unpacked size equals JS transferred. Measure minified/gzip
engine entry vs Viewer entry and actual browser transfer in C9.

## Boundaries

`components/site/visualizer-cesium/CesiumEarthCanvas.tsx` mounts only in dev on
loopback when engine=cesium (query or VISUALIZER_ENGINE). Production always Three.
UI state, props and callbacks remain in HistoryVisualizer. Only one engine mounts.
Pure shared country/capital DTO helpers must not import either rendering engine.
No parallel Three scene for lighting, labels, or models inside Cesium.

KnowledgeLayerManager owns attach, visibility, update and dispose for Capital,
City, Saint, Church, Monastery, Event, HistoricalTerritory and Nature layers.
Initially implement existing data only. CityLayer is an interface, no mass import.
Use primitive label/point collections for capitals and terrain ground geometry
for borders; consider GeoJsonDataSource first for polygons and benchmark it.

## Terrain / imagery

GeographicTilingScheme: level zero 2x1; X increases east, runtime Y south.
WGS84 angles in radians internally, source GeoJSON longitude/latitude degrees,
height in meters. Tiles declare bbox, parent, children, availability and hashes.
If Cesium terrain files use TMS, convert Y only at serialization/URL boundary.

Generate directly from source DEM/native cache, not GLB POSITION/NORMAL/UV.
Heightmap uses HeightmapTerrainData and explicit availability in a TerrainProvider.
Quantized mesh uses CesiumTerrainProvider.fromUrl with layer.json. Do not choose
the winner from file size alone. CustomHeightmapTerrainProvider is useful for a
spike but lacks availability/normals; not the final regional streaming provider.
Reference: https://cesium.com/learn/cesiumjs/ref-doc/CustomHeightmapTerrainProvider.html

NASA global and Sentinel regional imagery are independent imagery layers.
Local tiled UrlTemplateImageryProvider avoids loading the full 21600px image.
Close Sentinel imagery is zoom-gated; bounded coverage, no requests outside tile
availability. Missing tiles must not silently become invented terrain.

Source checksums and cache remain unchanged. Regional edges need a declared
transition to ellipsoid/coarse terrain, consistent shared samples, and parent
coverage. Quantized mesh requires correct edge indices/bounds/horizon occlusion.
DEM vertical datum and geoid correction are mandatory before clearance claims.

## Future delivery (not executed)

source/cache -> offline validated generator -> immutable versioned bundle -> R2
-> Worker/CDN same-origin routes -> native Cesium providers. Manifest publish is
atomic after every tile is verified. Content hashes, ETags, immutable caching,
CORS/CSP, correct MIME/compression and rollback version must be tested locally.
Do not reuse the old GLB terrain admin contract for quantized-mesh files.
