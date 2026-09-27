# Unified local globe

## Migration map

- CesiumEarthCanvas retains the only CesiumWidget constructor and camera.
- CalendarExperience becomes the common local shell.
- CalendarGlobeOverlay owns modes, one selection and the common right card.
- Existing countries, capitals, calendar and events renderers are reused.
- KnowledgeLayerManager owns visibility and disposal, including late registration.
- Cities reuse the existing dataset and capital renderer with close zoom rules.
- HistoryVisualizer and CalendarOverlay remain legacy production code, not local
  navigation destinations. No deletion before parity verification.
- Three.js remains available to Prayer and the unchanged production path.

No production assets, schema changes, remote writes or enrichment are involved.

## Verified 2026-09-19

- Local modes: globe, calendar, saints, churches, history, map. No navigation or
  widget recreation on mode changes. Map projection is a separate explicit action.
- Country/capital picking and saint selection share one state and one right card.
- 50 browser mode switches: instance ID 1, live count 1, identical camera XYZ,
  4 data sources, 4 top-level primitives, 5 layer input handlers, 4 pre-render
  listeners before and after. No page errors.
- Countries/borders remain active, 215 capitals remain visible across modes.
- Existing 7080 non-capital cities are independently enabled at close zoom.
- January 21: 2 real calendar places. Global catalog: 33 saints, 4 feasts,
  7 distinct entity/place markers. September 19: 10 entries, 0 geo markers.
- Layer toggles, country France and capital Rome cards, legacy history deep link,
  mobile 390x844 and desktop 1440x1000 tested with Playwright. No mobile horizontal
  overflow; canvas image variance confirms nonblank terrain imagery.
- Full suite: 153 files / 1445 tests. Final Cesium subset: 24 tests.

Reproducible browser audit (optional Playwright installation):

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/terrain/check-unified-globe.mjs
```

Report: `/tmp/unified-globe-audit.json`.

## Data limits

The local published history API currently returns no events. Churches and
monasteries are absent from the current catalog. Their panels and independent
visibility are ready; no records or coordinates were fabricated. Historical
territories reuse the existing event-linked renderer. Routes have no connected
dataset and their checkbox remains disabled. Full production content parity is
not claimed; legacy source is retained and no production release was performed.

## Streamed real Earth (calendar globe)

The calendar globe (`/pravoslavna-istoriya`, Cesium) streams its Earth instead of
shipping large textures. Nothing is downloaded into the repository. Implementation:
`lib/cesium/earth-streaming.ts`, UI: `EarthSourceControl.tsx`.

- Imagery: Cesium World Imagery through Cesium ion (Bing Aerial), the only basemap
  in production. Google Maps 2D (ion assets 3830182/3830184) was removed; do not
  reintroduce `IonImageryProvider.fromAssetId` for a Google asset in
  `earth-streaming.ts`. Two modes: Satellite (`IonWorldImageryStyle.AERIAL`) and
  Satellite + Streets (`IonWorldImageryStyle.AERIAL_WITH_LABELS`). Bing's own
  attribution stays visible in the Cesium credit bar.
- Satellite / Satellite+Streets is a layer `show` switch on one `CesiumWidget`;
  nothing is recreated. The old NASA/Blender Earth texture remains as the instant
  first-paint and offline fallback and is hidden once streamed imagery is ready.
- World Terrain and OSM Buildings (ion asset 96188) are dev-only toggles, default OFF.
  Buildings need terrain, so enabling them also enables terrain. URL: `?terrain=1`,
  `?buildings=1`, `?basemap=satellite|streets`. Legacy basemap values from before
  the Google removal (`google`, `cesium`, `map`, `google-streets`, `hybrid`,
  `overlay`) are migrated by `parseBasemap` so old links/localStorage keep working.
  `?earth=legacy` (dev) restores the old NASA + Alps path.
- Sacred Markers use the globe height (`globe.getHeight`) when terrain is on so
  models stay on the ground; marker geometry/design is unchanged.
- Token: `NEXT_PUBLIC_CESIUM_ION_TOKEN` (own ion token; never commit it). Without a
  token, production stays on the legacy NASA path; dev uses Cesium's evaluation token
  (it shows a credit warning and is not for production).
- CSP: on the Cesium route `connect-src` also allows `api.cesium.com`,
  `assets.ion.cesium.com`, `dev.virtualearth.net`, `*.tiles.virtualearth.net`.
- Dev-only probes: `lib/cesium/dev-probe.ts` (`window.__earthProbe`) and
  `window.__earth`; both are inactive in production builds.

This supersedes the "no ion / World Imagery / World Terrain" rule in
`CESIUM_ARCHITECTURE.md` for the calendar globe only.
