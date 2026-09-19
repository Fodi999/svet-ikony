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
