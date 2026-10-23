import * as C from '@cesium/engine';
import {markerBillboard,markerFallback,photoMarker} from './photo-marker';
import {markerPublication,type MarkerPublication} from './marker-publication';
import {createMarkerGroup} from './marker-groups';
import {createLayerHandler,interactiveHit,registerHoverResolver} from './handlers';
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
/** Admin-configured GLB (calendar_geo_place_models, published only): shown
 * up close, where the 2D pin hands over to it. */
export const PLACE_MODEL_MAX_DISTANCE = 3000, PLACE_PIN_MIN_DISTANCE_WITH_MODEL = 1200;
/** CesiumJS treats a glTF's +Z as "forward" and turns it to local East at
 * heading 0 (ModelUtility.getAxisCorrectionMatrix, Axis.Z_UP_TO_X_UP), so a
 * model authored north-up (Blender +Y = glTF -Z = north, e.g. the Varvara
 * church built on its OSM footprint) would appear turned 90° to the left.
 * This constant compensates, making the admin heading mean "degrees
 * clockwise from true north for a north-up model": heading 0 = as authored. */
export const GLTF_NORTH_HEADING_OFFSET = 90;
export function placeModelEntity(place: Pick<SacredPlaceMarker, 'id' | 'title' | 'lat' | 'lon' | 'model'>): C.Entity.ConstructorOptions | null {
  const model = place.model;
  if (!model) return null;
  const position = C.Cartesian3.fromDegrees(place.lon, place.lat, (model.altitude ?? 0) + model.heightOffset);
  return {
    id: `sacred-model:${place.id}`, name: place.title, properties: {sacredPlaceId: place.id}, position,
    orientation: C.Transforms.headingPitchRollQuaternion(position, new C.HeadingPitchRoll(C.Math.toRadians(model.heading + GLTF_NORTH_HEADING_OFFSET), C.Math.toRadians(model.pitch), C.Math.toRadians(model.roll))),
    model: {
      uri: model.url, scale: model.scale, minimumPixelSize: 0,
      // No surveyed altitude: stand on the terrain, lifted by heightOffset.
      heightReference: model.altitude === null ? C.HeightReference.RELATIVE_TO_GROUND : C.HeightReference.NONE,
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, PLACE_MODEL_MAX_DISTANCE),
    },
  };
}

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
  const markers = createMarkerGroup(widget,'SacredPlaces',{onError,
    open:entity=>{const id=entity.properties?.sacredPlaceId?.getValue();if(typeof id==='string')onSelect(id);},
    decorate:(entities,cluster)=>{
    const photographed=entities.find(entity=>markers.contains(entity)&&entity.properties?.publishedPhoto?.getValue()&&entity.billboard);
    if(photographed){
      cluster.billboard.show=true;
      cluster.billboard.image=photographed.billboard!.image?.getValue(widget.clock.currentTime);
      cluster.billboard.width=64;cluster.billboard.height=76;
      cluster.label.show=true;cluster.label.showBackground=true;
      cluster.label.pixelOffset=new C.Cartesian2(28,-28);
    }
  }});
  const selectionHexes=createSelectionHexController(widget,markers);
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
  const input = createLayerHandler(widget), handler = input.handler;
  const clearPlotHover=()=>plots?.hover(null);
  const removeHoverResolver=registerHoverResolver(widget,position=>{const plot=plots?.pickAt(position);return plot?`#${plot.displayNumber} · ${plot.areaM2.toFixed(1)} m²`:null;});
  widget.canvas.addEventListener('pointerleave',clearPlotHover);
  let lastHover=0;
  handler.setInputAction((movement:{endPosition:C.Cartesian2})=>{
    const now=performance.now();if(now-lastHover<70)return;lastHover=now;
    plots?.hover(plots?.pickAt(movement.endPosition)?.plotId??null);
  },C.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((movement: {position: C.Cartesian2}) => {
    // The shared topmost hit (handlers.ts) -- a pin/cluster of another layer
    // on top of this one's territory polygon keeps its own click.
    const top=interactiveHit(widget,movement.position);
    // Clusters (possibly mixing layers) are resolved by the shared marker source (marker-groups.ts).
    if(Array.isArray(top))return;
    const picked=top instanceof C.Entity&&top.properties?.hasProperty('sacredPlaceId')?top:undefined;
    if(top&&!picked&&!('sacredPlotId' in top))return;
    // Sacred Plot hexes take priority over whatever sits underneath them
    // (territory polygon, country polygon) -- resolved via an exact ground
    // lookup rather than scene.pick's z-order, see sacred-plots-layer.ts's
    // pickAt() header comment for why.
    const plot = plots?.pickAt(movement.position);
    if (plot) { plots?.select(plot.plotId); onSelectPlot(plot); return; }
    const id = picked instanceof C.Entity ? picked.properties?.sacredPlaceId?.getValue() : undefined;
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
    update(places: SacredPlaceMarker[], selectedId: string | null, images:MarkerPublication[] = []) {
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
      markers.removeAll();
      for (const place of places) {
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon) || Math.abs(place.lat) > 90 || Math.abs(place.lon) > 180) continue;
        const selected = place.id === selectedId;
        // With a published 3D model the pin hands over to the model up close.
        const pinFor=(image:string|HTMLCanvasElement)=>{
          const options=markerBillboard(image,selected);
          return place.model?{...options,distanceDisplayCondition:new C.DistanceDisplayCondition(PLACE_PIN_MIN_DISTANCE_WITH_MODEL,Number.MAX_VALUE)}:options;
        };
        if(selected)markers.add({id:`selection-hex:${place.id}`,...selectionHex(place.lon,place.lat,{sacredPlaceId:place.id})});
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
          markers.add({
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
        const entity=markers.add({
          id: `sacred-place:${place.id}`, name: place.title,
          properties: {sacredPlaceId: place.id},
          position: C.Cartesian3.fromDegrees(place.lon, place.lat),
          point: selected ? {
            pixelSize: 64, color: C.Color.fromCssColorString(GOLD).withAlpha(0.22),
            outlineWidth: 0, heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: 0,
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, BILLBOARD_MAX_DISTANCE)
          } : undefined,
          billboard: pinFor(markerFallback(place.type,selected)),
          label
        });
        const modelEntity=placeModelEntity(place);
        if(modelEntity)markers.add(modelEntity);
        const publication=markerPublication(images,null,place.id);
        if(publication?.markerKey){
          const image=new Image();image.crossOrigin='anonymous';
          image.onload=()=>{if(disposed||markers.getById(entity.id)!==entity)return;const bitmap=photoMarker(image,selected);if(bitmap){entity.billboard=new C.BillboardGraphics(pinFor(bitmap));entity.properties!.addProperty('publishedPhoto',true);markers.recluster();}widget.scene.requestRender();};
          image.src='/'+publication.markerKey;
        }
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
      disposed = true; generation++; selectionHexes.dispose();removeHoverResolver();widget.canvas.removeEventListener('pointerleave',clearPlotHover); input.dispose(); plots?.dispose(); markers.dispose();
      if (widget.isDestroyed()) return;
      if (territories) widget.dataSources.remove(territories, true);
    }
  };
}
