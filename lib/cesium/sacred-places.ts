import * as C from '@cesium/engine';
import {markerBillboard,markerFallback} from './photo-marker';
import {styleCluster} from './atlas-style';
import {createLayerHandler} from './handlers';
import {markerModel, calendarModelGraphics} from './sacred-markers';
import type {SacredPlaceMarker} from '@/lib/d1/repositories/calendarGeoPlaces';
import {createSacredPlotsLayer} from './sacred-plots-layer';
import {createSelectionHexController,selectionHex} from './selection-hex';
import type {SacredPlot, NearestPlaceCandidate} from './sacred-plots';

const GOLD = '#e9c479';

/** calendar_geo_places.place_type -> /icons/map/<name>.svg (see the header
 * comment on each file): a premium gold-ring pin with a simple Orthodox
 * cross glyph, distinct per family so a monastery/shrine/church can be told
 * apart at a glance, matching the reference mockup's pin style. Any
 * place_type this pilot doesn't have a dedicated glyph for (city, other,
 * historical_region, ...) falls back to the plain church pin rather than
 * showing nothing. */
const MARKER_ICONS: Readonly<Record<string, string>> = {church: '/icons/map/church.svg', monastery: '/icons/map/monastery.svg', shrine: '/icons/map/shrine.svg'};
const markerIcon = (type: string) => MARKER_ICONS[type] ?? MARKER_ICONS.church;
const BILLBOARD_WIDTH = 34, BILLBOARD_HEIGHT = 42, BILLBOARD_SELECTED_FACTOR = 1.15;
/** Only monastery/shrine (importance 90 per calendarGeoPlaces.ts's CASE
 * expression) get the existing GLB treatment -- "major/особо важных"
 * objects per the brief -- everything else (importance <= 80) stays a
 * lightweight SVG billboard. markerModel() already keys off exactly these
 * place_type strings (see sacred-markers.ts's `families` map), so this
 * reuses the same .glb assets and sizing math the chess-piece Christian
 * Places layer uses, with zero new model assets. */
const MODEL_IMPORTANCE_THRESHOLD = 90;
/** Billboards fade out at long range so a zoomed-out globe isn't littered
 * with pins (ТЗ п.8) -- GLB-backed places stay visible farther, via
 * calendarModelGraphics' own MODEL_MAX_DISTANCE (600km), matching "far away:
 * only major markers survive". */
const BILLBOARD_MAX_DISTANCE = 350_000;

type TerritoryGeometry = {type: 'Polygon'; coordinates: number[][][]} | {type: 'MultiPolygon'; coordinates: number[][][][]};
export type TerritoryFeature = {placeId: string; geometry: TerritoryGeometry};

/**
 * Always-on Sacred Place marker + territory layer -- independent of the
 * date-driven `createOrthodoxCalendarLayer` in ./calendar.ts. A pilgrimage
 * site like Kyiv-Pechersk Lavra has to stay visible regardless of what
 * civil date the calendar mode is currently showing, so this is its own
 * CustomDataSource/GeoJsonDataSource pair, not a filter on the calendar
 * layer's items.
 *
 * Marker and territory-polygon entities both carry `properties.sacredPlaceId`
 * so a click on either one resolves to the same placeId (per the approved
 * plan's "marker + territory polygon + panel reference one placeId").
 */
/**
 * `onSelectPlot` is called for a Sacred Plots hex click (ТЗ п.6/п.7 pilot,
 * see ./sacred-plots-layer.ts) -- kept as a *separate* callback from
 * `onSelect` (Sacred Place marker/territory click) rather than overloading
 * the existing one, so callers that only care about places are unaffected.
 */
export function createSacredPlacesLayer(widget: C.CesiumWidget, onSelect: (placeId: string) => void, onSelectPlot: (plot: SacredPlot) => void, onError: (error: unknown) => void, options:{legacyPlots?:boolean}={}) {
  const markers = new C.CustomDataSource('SacredPlaces');
  const selectionHexes=createSelectionHexController(widget,markers);
  markers.clustering.enabled=true;markers.clustering.minimumClusterSize=2;markers.clustering.pixelRange=2;
  markers.clustering.clusterLabels=false;
  const removeCluster=markers.clustering.clusterEvent.addEventListener((entities,cluster)=>{cluster.label.text=String(entities.length);styleCluster(cluster);cluster.label.id=entities;cluster.point.id=entities;cluster.billboard.id=entities;});
  const plots = options.legacyPlots ? createSacredPlotsLayer(widget) : null;
  let disposed = false, generation = 0, territories: C.GeoJsonDataSource | null = null, lastSelectedId: string | null = null;
  let placesVisible = true, plotsToggle = true;
  const syncPlotsVisibility = () => plots?.setVisible(placesVisible && plotsToggle);
  // Territory styling (ТЗ п.12): normal = 45-55% opacity gold outline / 3-5%
  // gold fill; selected = 90-100% opacity outline at 2.5-3px / 8-10% fill,
  // plus a brighter/thicker outline standing in for "soft glow" -- Cesium's
  // clamped-to-ground PolygonGraphics has no bloom/shader glow of its own,
  // so this is a deliberate, documented approximation rather than a true
  // glow pass. Either state must stay visibly subtler than the satellite
  // imagery it sits on top of.
  const highlightTerritories = (source: C.GeoJsonDataSource | null, selectedId: string | null) => {
    if (!source) return;
    for (const entity of source.entities.values) {
      if (!entity.polygon) continue;
      const id = entity.properties?.sacredPlaceId?.getValue();
      const highlighted = id === selectedId;
      entity.polygon.material = new C.ColorMaterialProperty(C.Color.fromCssColorString(GOLD).withAlpha(highlighted ? 0.09 : 0.04));
      entity.polygon.outlineColor = new C.ConstantProperty(C.Color.fromCssColorString(GOLD).withAlpha(highlighted ? 0.97 : 0.5));
      entity.polygon.outlineWidth = new C.ConstantProperty(highlighted ? 2.75 : 2);
    }
  };
  void widget.dataSources.add(markers).then(() => {
    if (disposed && !widget.isDestroyed()) widget.dataSources.remove(markers, true);
  }).catch(onError);
  const input = createLayerHandler(widget), handler = input.handler;
  const clearPlotHover=()=>plots?.hover(null);
  widget.canvas.addEventListener('pointerleave',clearPlotHover);
  let lastHover=0;
  handler.setInputAction((movement:{endPosition:C.Cartesian2})=>{
    const now=performance.now();if(now-lastHover<70)return;lastHover=now;
    plots?.hover(plots?.pickAt(movement.endPosition)?.plotId??null);
  },C.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((movement: {position: C.Cartesian2}) => {
    const picked=widget.scene.pick(movement.position)?.id;
    if(Array.isArray(picked)&&picked.length&&picked.every(entity=>markers.entities.contains(entity))){
      const points=picked.map(entity=>entity.position?.getValue(widget.clock.currentTime)).filter((p):p is C.Cartesian3=>!!p);
      if(points.length){const sphere=C.BoundingSphere.fromPoints(points);widget.camera.flyToBoundingSphere(sphere,{duration:1,offset:new C.HeadingPitchRange(0,-Math.PI/3,Math.max(1500,sphere.radius*3))});}
      return;
    }
    // Sacred Plot hexes take priority over whatever sits underneath them
    // (territory polygon, country polygon) -- resolved via an exact ground
    // lookup rather than scene.pick's z-order, see sacred-plots-layer.ts's
    // pickAt() header comment for why.
    const plot = plots?.pickAt(movement.position);
    if (plot) { plots?.select(plot.plotId); onSelectPlot(plot); return; }
    const id = widget.scene.pick(movement.position)?.id?.properties?.sacredPlaceId?.getValue();
    if (typeof id === 'string') onSelect(id);
  }, C.ScreenSpaceEventType.LEFT_CLICK);

  return {
    id: 'sacred-places', kind: 'event' as const,
    setVisible(value: boolean) {
      if (disposed) return;
      markers.show = value;
      if (territories) territories.show = value;
      placesVisible = value;
      syncPlotsVisibility();
      widget.scene.requestRender();
    },
    /** Sacred Plots layer ON/OFF (ТЗ п.8's compact toggle) -- independent of
     * the marker/territory visibility above, but still gated by it (no
     * point showing plots while the whole Sacred Places layer is hidden,
     * e.g. in 'calendar' mode). */
    setPlotsVisible(value: boolean) {
      if (disposed) return;
      plotsToggle = value;
      syncPlotsVisibility();
    },
    setPlotsAvailableOnly(value: boolean) {
      if (disposed) return;
      plots?.setAvailableOnly(value);
    },
    /** Pilot scope (ТЗ п.1): call this only for Kyiv-Pechersk Lavra's
     * territory feature. Returns the generated plots so the caller can pass
     * the count/list to the panel or a filter UI if needed; safe to call
     * again with the same sacredPlaceId+resolution -- cached internally. */
    setPlotTerritory(feature: TerritoryFeature, options?: {resolution?: number; parentPlaceId?: string; candidatePlaces?: NearestPlaceCandidate[]}) {
      if (disposed) return [] as SacredPlot[];
      return plots?.setTerritory({sacredPlaceId: feature.placeId, geometry: feature.geometry, ...options});
    },
    selectPlot(plotId: string | null) {
      if (disposed) return;
      plots?.select(plotId);
    },
    getPlot(plotId: string) {
      return plots?.getPlot(plotId);
    },
    update(places: SacredPlaceMarker[], selectedId: string | null) {
      if (disposed) return;
      // Restyle the territory polygons (if any are currently loaded) so the
      // selected place's polygon is visually highlighted and any previously
      // selected one reverts -- covers both a marker click and a
      // parent/child hierarchy navigation click, since both just change
      // `selectedId` and re-run this same update(). lastSelectedId is kept
      // so a territory that finishes loading *after* this call (setTerritories
      // is async and independent of selection) still gets highlighted.
      lastSelectedId = selectedId;
      highlightTerritories(territories, selectedId);
      markers.entities.removeAll();
      for (const place of places) {
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon) || Math.abs(place.lat) > 90 || Math.abs(place.lon) > 180) continue;
        const selected = place.id === selectedId;
        if(selected)markers.entities.add({id:`selection-hex:${place.id}`,...selectionHex(place.lon,place.lat,{sacredPlaceId:place.id})});
        const glbUri = undefined;
        const label = selected ? {
          text: place.title, font: '14px Georgia, serif',
          fillColor: C.Color.fromCssColorString(GOLD),
          style: C.LabelStyle.FILL_AND_OUTLINE, outlineColor: C.Color.BLACK, outlineWidth: 3,
          pixelOffset: new C.Cartesian2(0, glbUri ? -46 : -40), heightReference: C.HeightReference.CLAMP_TO_GROUND
        } : undefined;
        if (glbUri) {
          // "major/особо важных" tier (ТЗ п.3): the existing chess-piece GLB
          // system's own model + selection-glow math, untouched.
          markers.entities.add({
            id: `sacred-place:${place.id}`, name: place.title,
            properties: {sacredPlaceId: place.id},
            position: C.Cartesian3.fromDegrees(place.lon, place.lat),
            model: new C.ModelGraphics(calendarModelGraphics(glbUri, selected)),
            label
          });
          continue;
        }
        // Regular church/shrine/other tier: the new gold pin billboard.
        // A soft low-alpha halo point sits at the same position, underneath
        // the pin, standing in for "gold glow" when selected (ТЗ п.7) --
        // Cesium has no bloom/blur on a billboard of its own, so this is a
        // deliberate, documented approximation, same spirit as the
        // territory-highlight glow already used elsewhere in this file.
        markers.entities.add({
          id: `sacred-place:${place.id}`, name: place.title,
          properties: {sacredPlaceId: place.id},
          position: C.Cartesian3.fromDegrees(place.lon, place.lat),
          point: selected ? {
            pixelSize: 64, color: C.Color.fromCssColorString(GOLD).withAlpha(0.22),
            outlineWidth: 0, heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: 0,
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, BILLBOARD_MAX_DISTANCE)
          } : undefined,
          billboard: markerBillboard(markerFallback(place.type,selected),selected),
          label
        });
      }
      selectionHexes.refresh();
      widget.scene.requestRender();
    },
    // ТЗ п.14: on desktop the SacredPlacePanel sits over the right ~460px of
    // the viewport, so flying straight to the place's own coordinates would
    // center it right under the panel. Shifting the camera's ground target
    // (its nadir point, not `place` itself) slightly EAST of the place makes
    // the place render slightly WEST -- i.e. left, into the free viewport --
    // without touching the zoom/pinch/minimumZoomDistance architecture:
    // this only adjusts the flyTo destination's longitude, height (4000m)
    // and every other camera behavior stay exactly as before. Skipped
    // outright below 1024px, where the panel becomes a bottom sheet instead
    // of covering the map horizontally.
    focus(place: {lat: number; lon: number}) {
      if (disposed) return;
      const desktopPanelOpen = typeof window !== 'undefined' && window.innerWidth >= 1024;
      const metersPerDegreeLon = 111320 * Math.cos(place.lat * Math.PI / 180);
      const shiftLon = desktopPanelOpen && metersPerDegreeLon > 0 ? 1100 / metersPerDegreeLon : 0;
      widget.camera.flyTo({destination: C.Cartesian3.fromDegrees(place.lon + shiftLon, place.lat, 4000)});
    },
    /** Renders every given place's territory polygon at once, so a polygon
     * can be clicked (and open the same panel as its marker) even before
     * anything is selected -- selection only changes marker/label styling. */
    async setTerritories(features: TerritoryFeature[]) {
      if (disposed) return;
      const current = ++generation;
      if (territories) { widget.dataSources.remove(territories, true); territories = null; }
      if (!features.length) { widget.scene.requestRender(); return; }
      const collection = {
        type: 'FeatureCollection' as const,
        features: features.map((feature) => ({type: 'Feature' as const, properties: {sacredPlaceId: feature.placeId}, geometry: feature.geometry}))
      };
      const next = await C.GeoJsonDataSource.load(collection, {
        clampToGround: true,
        fill: C.Color.fromCssColorString(GOLD).withAlpha(0.04),
        stroke: C.Color.fromCssColorString(GOLD).withAlpha(0.5), strokeWidth: 2
      });
      if (disposed || current !== generation) { next.entities.removeAll(); return; }
      territories = next;
      highlightTerritories(territories, lastSelectedId);
      await widget.dataSources.add(next);
      if (disposed || current !== generation) {
        if (!widget.isDestroyed()) widget.dataSources.remove(next, true);
        return;
      }
      widget.scene.requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; selectionHexes.dispose();removeCluster();widget.canvas.removeEventListener('pointerleave',clearPlotHover); input.dispose(); plots?.dispose();
      if (widget.isDestroyed()) return;
      if (territories) widget.dataSources.remove(territories, true);
      widget.dataSources.remove(markers, true);
    }
  };
}
