# Sacred Markers - local delivery, 2026-09-21

## Source and assets

Reused the existing Marker_King base, rings, faceted twisted body and collar.
The original live scene was backed up to sacred-markers-before-20260921.blend.
The new Sacred Markers Studio scene in sacred-markers-set.blend contains
Sacred_Markers, six named masters, 18 LODs and a separate preview rig.
Materials: MI_Sacred_Ivory, MI_Sacred_Selected and MI_Sacred_Accent.
Rebuild: build_sacred_markers.py (requires the authored source scene).
Preview renderer: render_sacred_markers.py.

Exports: ../export/sacred-markers/ (24 GLBs and audit.json).
Runtime copies: public/markers/sacred/ (six LOD1 defaults).
Default payloads are 226004-361772 bytes; all six total 1636936 bytes.
These are uncompressed file payload sizes, not measured network transfer bytes.
Bottom origin, identity transforms, normalized relative heights and embedded images
are recorded in audit.json. All 24 GLBs passed finite-float accessor checks.
No exported cameras. Three LODs are prepared, not automatically switched at runtime.

## Native Cesium integration

One existing widget. ModelGraphics, CLAMP_TO_GROUND and ENU orientation.
Explicit type mapping in lib/cesium/sacred-markers.ts; unknown types retain billboards.
Models attach only within 600 km, in view, with a 25-model budget.
Far view allocates/downloads no GLBs. Overflow retains billboard fallback.
Selected appearance: 15% increase, gold silhouette and native clamped glow polyline ring.
Native labels remain separate from models and avoid nearby model/label overlaps.
Picking preserves the calendar entity mapping and opens the existing information card.
No new globe, terrain provider, imagery provider or database records.

Local fixtures require development + localhost and sacredDemo query parameter.
Use /ru/pravoslavna-istoriya?mode=globe&sacredDemo=6&atlasView=sacred
or sacredDemo=places for Rome, Jerusalem, Istanbul, Alexandria, Damascus and Athos.
Fixtures explicitly identify themselves as test data, not calendar records.

## Verification

37 Cesium tests pass across 10 files. ENU orientation, selection, fallback,
25-model budget, deduplication and disposal covered.
Chrome on Apple M4 / ANGLE Metal, 5-second forced-render samples:

| Models | FPS | Frame interval ms | Unique GLB requests |
|---|---:|---:|---:|
| 1 | 60.05 | 16.65 | 1 |
| 5 | 60.06 | 16.65 | 5 |
| 10 | 60.00 | 16.67 | 6 |
| 25 | 60.00 | 16.67 | 6 |

WebKit / Apple GPU: 59.94, 60.05, 59.80, 59.39 FPS respectively.
Active and ready model counts match in all four cases; one widget throughout.
No page errors. Later concurrent-browser testing reached about 55 FPS,
so these short samples are not a guarantee of sustained device performance.
GPU memory is unavailable; frame intervals are not isolated GPU timings.
Safari application itself was not tested, only Playwright WebKit.

Gallery: previews/sacred-20260921/index.html (lineup, six closeups, wireframe,
far, medium, selected and mobile). Mobile dense labels are suppressed rather
than allowed to overlap figures or leave the viewport.

## Remaining review

This is a local prototype, not an unconditional production-ready PASS.
Native terrain clamping is configured, but steep DEM ground-contact still needs
a dedicated visual acceptance check. Rapid near/far loading stress also remains.
The horse silhouette is intentionally simplified and less sculptural than the reference.
The existing low-resolution Italy imagery remains unchanged, as requested.
Production, R2, D1, calendar data, push and deploy were not touched.
