# Calendar globe UI: local design preview

Local entry: http://localhost:3000/uk/pravoslavna-istoriya?engine=cesium&calendarDate=2026-09-18

The new composition is gated to development on localhost. Production routing
is unchanged. `view=history` keeps the existing historical visualizer accessible.
No schema, resolver, calendar import or data changes were made for this UI task.
The bulk enrichment remains stopped. No push, deploy or production D1/R2 writes.

## Composition

- Full-viewport real Cesium globe, Mediterranean overview, existing NASA imagery,
  atmosphere, solar lighting and star sky. Specialized brand/date/navigation.
- Day entries remain separate from geographic items in the existing API payload.
  The UI does not require geography for entry selection or details.
- Closed day drawer by default; grouped list and search when opened.
- Selected information card has intrinsic height, bounded scrolling and real
  available content only. No synthetic photos, saints, coordinates or markers.
- Gold points have priority sizes; selected entities use an outlined halo.
  Circular thumbnails are enabled only for existing usable images and fall back
  to points. Avoid combining clamped point and billboard on one Cesium entity:
  the cluster visualizers share billboard resources and otherwise enlarge dots.
- User-initiated geography focus preserves a globe-scale view. Date changes
  never call flyTo. No-geo selection does not move the camera.
- Mobile navigation uses a menu; list and selection use mutually exclusive
  bottom sheets. Camera controls, 2D map, overview, lighting and timeline work.

## Visual comparison

1. `/tmp/calendar-design/01-desktop-no-selection.png`: main hierarchy matches;
   existing NASA surface has less cloud detail and a subtler rim than the mockup.
   No artificial sun flare or invented dense marker field.
2. `/tmp/calendar-design/02-desktop-geo.png`: real Basil/Kayseri selection,
   gold highlight and right card; no approved image, so no thumbnail/photo hero.
3. `/tmp/calendar-design/03-desktop-no-geo.png`: shorter information card,
   neutral missing-place note, real source link. English source title remains
   when no linked Ukrainian translation exists. No generated biography.
4. `/tmp/calendar-design/04-desktop-day-drawer.png`: functional grouped drawer
   is additional to the reference; only appears on request, no central fixed list.
5. `/tmp/calendar-design/05-mobile-entity.png`: mobile bottom sheet and compact
   globe, not a scaled-down three-column desktop layout.

## Verification

Playwright desktop 1536x1024, tablet 1024x768, mobile 390x844 and 360x740:
20 sequential date changes, drawer, entry/card close, real marker click,
geo flyTo, no-geo no-fly, UK/RU/EN locale switching, no horizontal overflow,
no JavaScript errors and nonblank canvas-pixel checks passed.
The dev-only camera-position data attribute is read-only browser QA telemetry.
Build completed including 223 client JavaScript syntax checks.
Existing full suite: 152 files / 1441 tests passed; lint has warnings, no errors.

Browser QA scripts and screenshots are under `/tmp/calendar-design/`.
