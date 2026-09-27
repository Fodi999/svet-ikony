import * as C from '@cesium/engine';
import type {SacredPlot, SacredPlotStatus, TerritoryGeometry} from './sacred-plots';
import {boundsOf, pointInPolygon, generateSacredPlots, type NearestPlaceCandidate} from './sacred-plots';
import {uniquePlotEdges} from './plot-edges';

const GOLD = '#e9c479';

const STATUS_FILL: Readonly<Record<SacredPlotStatus, string>> = {
  // Soft, desaturated tints per the brief (ТЗ п.4) -- kept subtle enough
  // that the satellite imagery underneath always reads through.
  available: '#7fd9a0', // soft green
  owned: '#7d9be0', // soft royal blue
  reserved: '#98a4b3', // neutral grey-blue
};
const STATUS_ALPHA: Readonly<Record<SacredPlotStatus, number>> = {available: 0.035, owned: 0.10, reserved: 0.065};
const SELECTED_FILL_ALPHA = 0.16;
const BORDER_RGBA = 'rgba(226,230,224,0.46)';

function colorForStatus(status: SacredPlotStatus): C.Color {
  return C.Color.fromCssColorString(STATUS_FILL[status]).withAlpha(STATUS_ALPHA[status]);
}

const SQRT3 = Math.sqrt(3);
const METERS_PER_DEG_LAT = 111_320;
function metersPerDegLon(atLat: number) { return 111_320 * Math.cos((atLat * Math.PI) / 180); }

/** Mirrors sacred-plots.ts's local tangent-plane projection exactly (same
 * origin/size math) so a click's ground position resolves to the identical
 * axial cell that generateSacredPlots() produced -- see the file header
 * note on why this project has a hand-rolled hex grid instead of h3-js. */
function axialAt(lon: number, lat: number, originLon: number, originLat: number, size: number): [number, number] {
  const mLon = metersPerDegLon(originLat) || 1e-6;
  const x = (lon - originLon) * mLon, y = (lat - originLat) * METERS_PER_DEG_LAT;
  const cellW = size * SQRT3;
  const rf = y / (size * 1.5);
  const qf = x / cellW - rf / 2;
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
  const qDiff = Math.abs(q - qf), rDiff = Math.abs(r - rf), sDiff = Math.abs(s - sf);
  if (qDiff > rDiff && qDiff > sDiff) q = -r - s; else if (rDiff > sDiff) r = -q - s;
  return [q, r];
}

// ---------------------------------------------------------------------------
// PERFORMANCE NOTE (see PERF_INVESTIGATION.md for the full write-up):
//
// The first pilot pass rendered every hex as its own Cesium GeometryInstance
// inside a couple of big GroundPrimitive/GroundPolylinePrimitive batches
// (one instance per hex per fill + one per border, ~6531 each). That is the
// textbook "batch everything into one primitive" Cesium pattern, and it IS
// batched at the draw-call level (~50 GL draw commands total, confirmed via
// scene.frameState.commandList) -- but measured live it still dropped FPS
// from a ~42fps baseline to ~4-5fps at close zoom. Isolating fills-only vs
// borders-only vs allowPicking on/off showed the cost is *per classified
// geometry instance* (roughly +100ms of frame time each for fills and for
// borders, additively, regardless of allowPicking) -- i.e. GroundPrimitive's
// terrain-classification (shadow-volume/stencil) technique itself scales
// with instance COUNT against real (non-flat) terrain, not with draw-call
// count or picking metadata. ~6531 tiny classified instances is simply a
// bad fit for that technique, however tidy the batching.
//
// This file instead paints the whole grid (outlines + per-status fills) as
// ONE bitmap and drapes it on the terrain as a single Cesium
// SingleTileImageryProvider/ImageryLayer -- Cesium's native, highly
// optimized path for "a picture draped on the ground", using ordinary
// texture sampling instead of thousands of per-feature stencil passes.
// Picking stays exact-math (ray -> globe.pick -> axialAt), so the imagery
// bitmap never participates in click handling. The selected plot is kept as
// its own tiny separate Entity (1 instance), which is cheap for exactly the
// reason the full grid wasn't.
// ---------------------------------------------------------------------------

const MAX_CANVAS_DIM = 2048;

type Bounds = {minLon: number; minLat: number; maxLon: number; maxLat: number};

function boundsFromPlots(plots: SacredPlot[]): Bounds {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const plot of plots) for (const [lon, lat] of plot.boundary) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return {minLon, minLat, maxLon, maxLat};
}

/** Paints every plot's hex (outline + per-status fill, ТЗ п.C) onto one
 * canvas in ground-plane pixel space. `onlyAvailable` bakes the
 * "available only" filter directly into the bitmap (fully transparent,
 * not just hidden, for filtered-out cells) so toggling that filter at
 * runtime is just an ImageryLayer.show swap between two pre-baked layers --
 * never a bitmap rebuild (ТЗ C's "не пересоздавать bitmap ... при
 * изменении selected plot" extended to the available-only toggle too). */
function paintBitmap(plots: SacredPlot[], bounds: Bounds, onlyAvailable: boolean, geometry: TerritoryGeometry): HTMLCanvasElement {
  const widthM = Math.max(1, (bounds.maxLon - bounds.minLon) * metersPerDegLon((bounds.minLat + bounds.maxLat) / 2));
  const heightM = Math.max(1, (bounds.maxLat - bounds.minLat) * METERS_PER_DEG_LAT);
  const pxPerMeter = MAX_CANVAS_DIM / Math.max(widthM, heightM);
  const width = Math.max(2, Math.round(widthM * pxPerMeter));
  const height = Math.max(2, Math.round(heightM * pxPerMeter));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const toPx = (lon: number, lat: number): [number, number] => [
    ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) * width,
    ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat || 1)) * height,
  ];
  ctx.lineJoin = 'round';
  // Union the polygons while preserving holes, then clip every fill and edge.
  const mask=document.createElement('canvas');mask.width=width;mask.height=height;
  const maskCtx=mask.getContext('2d')!;
  for(const polygon of geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates){
    maskCtx.beginPath();
    for(const ring of polygon){
      ring.forEach(([lon,lat],i)=>{const [x,y]=toPx(lon,lat);if(i===0)maskCtx.moveTo(x,y);else maskCtx.lineTo(x,y);});
      maskCtx.closePath();
    }
    maskCtx.fill('evenodd');
  }
  const shown=onlyAvailable?plots.filter(plot=>plot.status==='available'):plots;
  for (const plot of shown) {
    ctx.beginPath();
    plot.boundary.forEach(([lon, lat], i) => {
      const [x, y] = toPx(lon, lat);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const c = colorForStatus(plot.status);
    ctx.fillStyle = `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha})`;
    ctx.fill();
  }
  ctx.beginPath();
  for(const [a,b] of uniquePlotEdges(shown)){ctx.moveTo(...toPx(...a));ctx.lineTo(...toPx(...b));}
  // A restrained dark casing keeps the thin light edge legible over roofs.
  ctx.lineWidth=Math.max(1.6,pxPerMeter*.32);ctx.strokeStyle='rgba(9,20,24,0.25)';ctx.stroke();
  ctx.lineWidth=Math.max(.8,pxPerMeter*.17);ctx.strokeStyle=BORDER_RGBA;ctx.stroke();
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);
  return canvas;
}

type TerritoryState = {
  key: string;
  sacredPlaceId: string;
  resolution: number;
  originLon: number;
  originLat: number;
  size: number;
  geometry: TerritoryGeometry;
  plots: SacredPlot[];
  byGridCellId: Map<string, SacredPlot>;
  byId: Map<string, SacredPlot>;
  layerAll: C.ImageryLayer;
  layerAvailable: C.ImageryLayer;
  /** Bounding-sphere-ish reference point for the centralized LOD controller
   * below (ТЗ п.D) -- distance from the camera to this point drives the
   * FAR/GRID/DETAIL state machine, not camera height alone, so a tilted
   * camera doesn't miscalculate (ТЗ п.D's "distance до bounding
   * sphere/center Lavra"). */
  centerCartesian: C.Cartesian3;
};

// ---------------------------------------------------------------------------
// Centralized LOD (ТЗ п.D): one state machine instead of the old per-instance
// DistanceDisplayCondition(0, 900) -- that constant turned out to not
// reliably correspond to the *observed* on-screen cutoff (per-instance
// distance display conditions on GroundPrimitive/terrain classification
// measured, live, as hiding somewhere around 2000-2500m instead of 900m,
// and were unaffected by changing the constant -- a Cesium
// classification-primitive quirk, not a bug in the constant's value). This
// file's LOD instead reads real camera-to-territory distance itself on
// every postRender tick and drives three explicit states with hysteresis
// (separate enter/exit thresholds per ТЗ п.D, so the layer doesn't flicker
// right at the boundary):
//
//   FAR    -- imagery hidden entirely (only the Sacred Place marker + the
//             existing always-on gold territory contour remain, both
//             outside this file).
//   GRID   -- imagery visible; selected plot's gold outline visible;
//             selected plot's "#N" label hidden (avoids label clutter at
//             a zoom where dozens of hexes are on screen).
//   DETAIL -- imagery visible; selected plot's outline AND "#N" label both
//             visible.
//
// Thresholds below were tuned and confirmed by live testing on this
// project's own Lavra pilot camera (see PERF_INVESTIGATION.md) -- unlike
// the old per-instance condition, these are plain JS distance checks, so
// the observed on-screen crossover matches the configured number exactly
// (no GPU-classification surprise).
// ---------------------------------------------------------------------------
const GRID_ENTER_M = 1200, GRID_EXIT_M = 1500;
const DETAIL_ENTER_M = 220, DETAIL_EXIT_M = 320;
type LodState = 'FAR' | 'GRID' | 'DETAIL';

/**
 * Sacred Plots rendering layer -- pure Cesium concern, owns no input
 * handler of its own (ТЗ п.6: "не добавлять второй глобальный click
 * handler"). lib/cesium/sacred-places.ts's existing single LEFT_CLICK
 * handler calls `pickAt()` to resolve a click against the active grid, and
 * calls `select()` to drive the gold selection glow + label.
 */
export function createSacredPlotsLayer(widget: C.CesiumWidget) {
  let disposed = false, visible = true, availableOnly = false, territory: TerritoryState | null = null;
  let lodState: LodState = 'FAR';
  let hoveredId:string|null=null,selectedId:string|null=null;
  const selection = new C.CustomDataSource('SacredPlots-selection');
  void widget.dataSources.add(selection);

  function applyVisibility() {
    const showAll = visible && !availableOnly && lodState !== 'FAR';
    const showAvailable = visible && availableOnly && lodState !== 'FAR';
    if (territory) { territory.layerAll.show = showAll; territory.layerAvailable.show = showAvailable; }
    selection.show = visible && lodState !== 'FAR';
    updateSelectionDetail();
  }

  function updateSelectionDetail() {
    // Selected plot's "#N" label only at the DETAIL tier (ТЗ п.D) -- the
    // gold outline itself stays visible through GRID+DETAIL, only the
    // label toggles, per-entity, without touching the outline entity.
    for (const entity of selection.entities.values) {
      if (entity.label) entity.label.show = new C.ConstantProperty(lodState === 'DETAIL') as unknown as C.Property;
    }
  }

  function checkLod() {
    if (!territory || disposed) return;
    const distance = C.Cartesian3.distance(widget.camera.positionWC, territory.centerCartesian);
    const opacity=Math.max(0,Math.min(1,(GRID_EXIT_M-distance)/600));
    if(Math.abs(territory.layerAll.alpha-opacity)>.015){
      territory.layerAll.alpha=opacity;territory.layerAvailable.alpha=opacity;
      widget.scene.requestRender();
    }
    let next = lodState;
    if (lodState !== 'FAR' && distance > GRID_EXIT_M) next = 'FAR';
    else if (lodState === 'FAR' && distance <= GRID_ENTER_M) next = 'GRID';
    if (next !== 'FAR') {
      if (next !== 'DETAIL' && distance <= DETAIL_ENTER_M) next = 'DETAIL';
      else if (next === 'DETAIL' && distance > DETAIL_EXIT_M) next = 'GRID';
    }
    if (next !== lodState) { lodState = next; applyVisibility(); widget.scene.requestRender(); }
  }
  const removeLodListener = widget.scene.postRender.addEventListener(checkLod);

  function destroyTerritory() {
    if (!territory) return;
    // React may dispose the parent widget before its overlay effects clean up.
    if (!widget.isDestroyed()) {
      widget.scene.imageryLayers.remove(territory.layerAll, true);
      widget.scene.imageryLayers.remove(territory.layerAvailable, true);
    }
    territory = null;
  }

  return {
    id: 'sacred-plots', kind: 'event' as const,
    setVisible(value: boolean) {
      visible = value;
      applyVisibility();
      widget.scene.requestRender();
    },
    setAvailableOnly(value: boolean) {
      availableOnly = value;
      applyVisibility();
      widget.scene.requestRender();
    },
    /** Builds (or reuses, if the territory+resolution pair is unchanged --
     * ТЗ п.11 "geometry должна кешироваться по territoryId + resolution")
     * the hex grid for one Sacred Place's territory. Pilot scope: call this
     * for Kyiv-Pechersk Lavra only (ТЗ п.1). Both the "all statuses" and
     * "available only" bitmaps are baked once, here, so the runtime
     * available-only toggle (setAvailableOnly above) never repaints or
     * rebuilds anything -- just swaps which of the two layers is shown. */
    setTerritory(options: {
      sacredPlaceId: string;
      geometry: TerritoryGeometry;
      resolution?: number;
      parentPlaceId?: string;
      candidatePlaces?: NearestPlaceCandidate[];
    }) {
      if (disposed) return [] as SacredPlot[];
      const resolution = options.resolution ?? 13;
      const key = `${options.sacredPlaceId}:${resolution}`;
      if (territory?.key === key) return territory.plots;
      const buildStart = performance.now();
      const plots = generateSacredPlots({
        territoryPolygon: options.geometry, sacredPlaceId: options.sacredPlaceId,
        resolution, parentPlaceId: options.parentPlaceId, candidatePlaces: options.candidatePlaces,
      });
      destroyTerritory();
      selection.entities.removeAll();
      hoveredId=null;selectedId=null;
      if (!plots.length) return plots;
      const extent=boundsOf(options.geometry);
      const originLon=(extent.minLon+extent.maxLon)/2,originLat=(extent.minLat+extent.maxLat)/2;
      // size derived back from the first plot's area (regular hexagon: area = 3*sqrt3/2 * size^2)
      const size = Math.sqrt((plots[0]?.areaM2 ?? 44) / ((3 * SQRT3) / 2));
      const byGridCellId = new Map<string, SacredPlot>(), byId = new Map<string, SacredPlot>();
      for (const plot of plots) { byGridCellId.set(plot.gridCellId, plot); byId.set(plot.plotId, plot); }

      const bounds = boundsFromPlots(plots);
      const rectangle = C.Rectangle.fromDegrees(bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat);
      const bitmapAll = paintBitmap(plots, bounds, false, options.geometry);
      const bitmapAvailable = paintBitmap(plots, bounds, true, options.geometry);
      const layerAll = widget.scene.imageryLayers.addImageryProvider(new C.SingleTileImageryProvider({
        url: bitmapAll.toDataURL('image/png'), rectangle, tileWidth: bitmapAll.width, tileHeight: bitmapAll.height,
      }));
      const layerAvailable = widget.scene.imageryLayers.addImageryProvider(new C.SingleTileImageryProvider({
        url: bitmapAvailable.toDataURL('image/png'), rectangle, tileWidth: bitmapAvailable.width, tileHeight: bitmapAvailable.height,
      }));
      layerAll.show = false; layerAvailable.show = false;
      const centerCartesian = C.Cartesian3.fromDegrees(originLon, originLat);
      territory = {key, geometry:options.geometry, sacredPlaceId: options.sacredPlaceId, resolution, originLon, originLat, size, plots, byGridCellId, byId, layerAll, layerAvailable, centerCartesian};
      console.info(`[sacred-plots] ${options.sacredPlaceId}: ${plots.length} cells @ res${resolution} (~${plots[0]?.areaM2.toFixed(1) ?? '?'}m² each), bitmap ${bitmapAll.width}x${bitmapAll.height}px, built in ${(performance.now() - buildStart).toFixed(0)}ms`);
      checkLod();
      applyVisibility();
      widget.scene.requestRender();
      return plots;
    },
    /** Exact (non-GPU-pick) resolution of a screen click against the active
     * grid -- mirrors lib/cesium/countries.ts's own ray -> globe.pick ->
     * cartographic technique, so this stays consistent with the rest of the
     * codebase rather than depending on any GPU picking (the raster grid
     * has none -- ТЗ п.C's "raster layer не участвует в picking"). Returns
     * null when plots aren't currently visible (layer off, LOD at FAR, no
     * territory loaded yet, or the cell is filtered out by "available
     * only"). */
    pickAt(position: C.Cartesian2): SacredPlot | null {
      if (!visible || !territory || disposed || lodState === 'FAR') return null;
      const ray = widget.camera.getPickRay(position);
      if (!ray) return null;
      const point = widget.scene.globe.pick(ray, widget.scene);
      if (!point) return null;
      if (C.Cartesian3.distance(widget.camera.positionWC, point) > GRID_EXIT_M) return null;
      const cartographic = C.Cartographic.fromCartesian(point);
      const lon = C.Math.toDegrees(cartographic.longitude), lat = C.Math.toDegrees(cartographic.latitude);
      if(!pointInPolygon(lon,lat,territory.geometry))return null;
      const [q, r] = axialAt(lon, lat, territory.originLon, territory.originLat, territory.size);
      const plot = territory.byGridCellId.get(`${q}:${r}`);
      if (!plot || (availableOnly && plot.status !== 'available')) return null;
      return plot;
    },
    getPlot(plotId: string): SacredPlot | null { return territory?.byId.get(plotId) ?? null; },
    hover(plotId:string|null){
      const id=plotId===selectedId?null:plotId;
      if(id===hoveredId||disposed||!territory)return;
      hoveredId=id;selection.entities.removeById('plot-hover');
      const plot=id?territory.byId.get(id):null;
      if(plot)selection.entities.add({id:'plot-hover',polyline:{positions:C.Cartesian3.fromDegreesArray(plot.boundary.flat()),width:2,clampToGround:true,
        material:new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString('#f2eee3'),outlineColor:C.Color.fromCssColorString('#152126'),outlineWidth:.6})}});
      widget.scene.requestRender();
    },
    /** Gold outline + glow + fill + centered "#N" label for the selected
     * hex -- a single small Entity (auto-classified as its own tiny
     * GroundPrimitive internally), never the whole-grid rebuild the old
     * per-instance-attribute approach also avoided; this file just no
     * longer needs GeometryInstanceAttributes at all since the base grid
     * isn't made of per-hex instances anymore. */
    select(plotId: string | null) {
      if (!territory) return;
      selectedId=plotId;hoveredId=null;
      selection.entities.removeAll();
      const plot = plotId ? territory.byId.get(plotId) : null;
      if (plot) {
        const positions = C.Cartesian3.fromDegreesArray(plot.boundary.flat());
        selection.entities.add({
          polygon: {
            hierarchy: new C.PolygonHierarchy(positions),
            material: C.Color.fromCssColorString(GOLD).withAlpha(SELECTED_FILL_ALPHA),
            classificationType: C.ClassificationType.TERRAIN,
          },
        });
        selection.entities.add({
          polyline: {
            positions, width: 3, clampToGround: true,
            material: new C.PolylineOutlineMaterialProperty({color: C.Color.fromCssColorString(GOLD), outlineColor:C.Color.fromCssColorString('#152126'),outlineWidth:1}),
          },
        });
        selection.entities.add({
          position: C.Cartesian3.fromDegrees(plot.center.lon, plot.center.lat),
          label: {
            text: `#${plot.displayNumber} · ${plot.areaM2.toFixed(1)} m²`, font: '24px sans-serif', scale:0.6,
            fillColor: C.Color.fromCssColorString(GOLD), style: C.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: C.Color.BLACK, outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: lodState === 'DETAIL',
          },
        });
      }
      widget.scene.requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeLodListener();
      destroyTerritory();
      if (!widget.isDestroyed()) widget.dataSources.remove(selection, true);
    },
  };
}
