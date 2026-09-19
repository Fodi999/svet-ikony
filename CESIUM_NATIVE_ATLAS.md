# Native Cesium atlas (local only)

Installed `@cesium/engine`: 26.3.0. No dependency upgrade, API/calendar data changes, D1/R2 writes, push or deployment.

## Native implementation

- Countries: LabelCollection, 28px source font downscaled to 0.72. Capitals/saints: LabelGraphics, 24px source font; cities: 22px. FILL_AND_OUTLINE, distance display/translucency/scaling, pixel offsets. No font upscaling.
- Widget uses physical device pixels, capped at 2x. Explicit FXAA off; native MSAA retained. DPR2 test canvas increased from 2160x1500 to 2880x2000 at CSS1440x1000.
- Country labels use explicit horizon culling and depth-test bypass to prevent glyphs intersecting the globe. Countries disappear below 200km. Border depth remains native, not bypassed.
- Capitals: PointGraphics, 9px gold fill, dark 2px outline. Cities: smaller cool-gray points. Saints: native BillboardGraphics with SVG icon asset, separate selected appearance; approved thumbnails retain round-image support.
- Default choice: dark SVG saint badge. PinBuilder was tested but its light pin has less contrast on sand. Dev-only `atlasStyle=points|billboards|pin` supports comparison.
- Country labels are never clustered. Native EntityCluster groups overlapping thematic markers and city points; labels alone do not create city clusters. Selection IDs remain mapped to the existing entities.
- Country boundaries use GroundPolylinePrimitive, width1 neutral low-opacity lines. Selected country only uses clamped PolylineGlowMaterialProperty plus PolylineOutlineMaterialProperty. No universal glow.

## LOD and cost

- Far globe: sparse country names. Capitals below 8.5Mm camera height, subject to native distance visibility.
- Cities: major ranks below 1.8Mm; progressively more ranks below 400km, 100km and 25km. Nonselected saint labels below 1.2Mm; selected labels remain visible farther away.
- Country/capital/city labels reserve screen space to reduce collisions. Native distance fading remains active.
- Country labels use one collection. City catalog remains cached, but only eligible on-screen city Entities are created (maximum600), retaining native EntityCluster and picking instead of thousands of permanent Entities. Capital source retains215 Entities.
- These thresholds are deliberately configurable in atlas-style.ts. Imagery resolution is unchanged; low-resolution satellite pixels at close zoom are independent of label sharpness.

## Installed API audit

Local source: node_modules/@cesium/engine/Source/Scene/Label.js explicitly recommends larger font size instead of large scale to avoid pixelation. CesiumWidget defaults useBrowserRecommendedResolution=true, which ignores devicePixelRatio.

PinBuilder is exported and supports fromText/fromColor/fromUrl/fromMakiIconId; prototype uses fromText without remote icon requests.

MVTDataProvider IS EXPORTED. Its source documents an experimental API: fromUrl(url, options), minZoom/maxZoom, extent, featureIdProperty, heightReference and scene. It converts MVT/PBF vector tiles to the native vector/3D Tiles path. Clamping requires scene. Future border/road/large-vector streaming is possible with stable feature IDs and a compatible tile service; text labeling and existing selection mapping still require integration. Not enabled here, no tiles fetched, no Cesium upgrade.

## Visual comparison

Local gallery: /tmp/atlas-comparison/index.html. True baseline files current-*.png were captured before changes. Points, SVG billboards and PinBuilder are captured at identical global/Europe/Egypt camera presets on DPR2. City preset covers Bologna. Query atlasView is development-only.

Current local saint sample has no approved portrait: custom-icon appearance is visually exercised, thumbnail support is retained but not represented as a tested real portrait. Dense real church data is also absent; clustering uses the shared native thematic source and needs a populated church fixture for a dedicated density acceptance test.

Verification: TypeScript and scoped ESLint passed; 10 Cesium test files / 28 tests passed. Browser test passed 50 mode switches with one unchanged widget/camera, four top-level primitives, five layer input handlers and four preRender listeners. No page errors in the comparison runs. Bologna close view creates one eligible city Entity instead of the entire catalog.
