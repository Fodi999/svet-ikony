import type * as Cesium from '@cesium/engine';

/**
 * Streamed real-Earth sources for the single CesiumWidget: Cesium World
 * Imagery (Bing Aerial / Aerial with road labels) via Cesium ion, plus
 * optional Cesium World Terrain and optional Cesium OSM Buildings. Nothing
 * is bundled or copied into the repository; every source is streamed by
 * native CesiumJS providers and is toggled with `show` / terrainProvider
 * swaps, so the widget is never recreated.
 *
 * Google Maps 2D imagery (ion assets 3830182/3830184) was removed from
 * production: Cesium World Imagery is now the only basemap. Do not
 * reintroduce IonImageryProvider.fromAssetId for a Google asset here.
 *
 * Token: NEXT_PUBLIC_CESIUM_ION_TOKEN (public by design, restrict it by URL in
 * the ion dashboard). Without it production keeps the old self-hosted NASA
 * layer and makes no ion request. In development CesiumJS' built-in
 * evaluation token is used so the feature can be evaluated locally.
 */
type CesiumModule = typeof Cesium;
export type Basemap = 'satellite' | 'streets' | 'road';
export type EarthStreamingState = {
  basemap: Basemap;
  provider: string;
  terrain: boolean;
  buildings: boolean;
  error: string;
};
export type EarthStreaming = ReturnType<typeof createEarthStreaming>;

export function earthStreamingEnabled(search = '') {
  if (new URLSearchParams(search).get('earth') === 'legacy' && process.env.NODE_ENV === 'development') return false;
  return Boolean(process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) || process.env.NODE_ENV === 'development';
}

// Legacy basemap values from before the Google-imagery removal, kept so old
// localStorage entries and shared URLs don't silently fall through to the
// default instead of the closest surviving mode.
const LEGACY_BASEMAP: Record<string, Basemap> = {
  google: 'satellite', cesium: 'satellite', map: 'streets', 'google-streets': 'streets', hybrid: 'streets', overlay: 'streets',
};
export function parseBasemap(value: string | null | undefined): Basemap {
  if (value === 'satellite' || value === 'streets' || value === 'road') return value;
  if (value && LEGACY_BASEMAP[value]) return LEGACY_BASEMAP[value];
  return 'satellite';
}

export function createEarthStreaming(C: CesiumModule, widget: Cesium.CesiumWidget, fallback: Cesium.ImageryLayer, options: { basemap?: Basemap } = {}) {
  const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  if (token) C.Ion.defaultAccessToken = token;
  const layers: Partial<Record<Basemap, Cesium.ImageryLayer>> = {};
  const building = new Map<Basemap, Promise<Cesium.ImageryLayer>>();
  const state: EarthStreamingState = { basemap: options.basemap ?? 'satellite', provider: 'nasa-fallback', terrain: false, buildings: false, error: '' };
  const listeners = new Set<(state: EarthStreamingState) => void>();
  let disposed = false;
  let terrainRun = 0;
  let tileset: Cesium.Cesium3DTileset | undefined;
  let tilesetRun: Promise<Cesium.Cesium3DTileset> | undefined;
  const publish = () => {
    if (widget.isDestroyed()) return;
    widget.canvas.dataset.earthBasemap = state.basemap;
    widget.canvas.dataset.earthProvider = state.provider;
    widget.canvas.dataset.earthTerrain = state.terrain ? 'world' : 'off';
    widget.canvas.dataset.earthBuildings = state.buildings ? 'osm' : 'off';
    for (const listener of listeners) listener({ ...state });
    widget.scene.requestRender();
  };
  const fail = (scope: string, error: unknown) => {
    state.error = `${scope}: ${error instanceof Error ? error.message : String(error)}`;
    publish();
  };

  async function providerFor(mode: Basemap) {
    // 'road' is the plain road map (roads, towns, labels) used for "how to get there".
    const style = mode === 'road' ? C.IonWorldImageryStyle.ROAD : mode === 'streets' ? C.IonWorldImageryStyle.AERIAL_WITH_LABELS : C.IonWorldImageryStyle.AERIAL;
    const provider = await C.createWorldImageryAsync({ style });
    return { provider, name: 'cesium-world-imagery' };
  }
  function layerFor(mode: Basemap) {
    let promise = building.get(mode);
    if (!promise) {
      promise = providerFor(mode).then(({ provider, name }) => {
        if (disposed) throw new Error('disposed');
        const layer = new C.ImageryLayer(provider);
        layer.show = false;
        widget.scene.imageryLayers.add(layer, 1);
        layers[mode] = layer;
        state.provider = name;
        return layer;
      });
      building.set(mode, promise);
      promise.catch(() => building.delete(mode));
    }
    return promise;
  }
  async function setBasemap(mode: Basemap) {
    state.basemap = mode;
    publish();
    try {
      const layer = await layerFor(mode);
      if (disposed || state.basemap !== mode) return;
      for (const value of Object.values(layers)) if (value) value.show = value === layer;
      fallback.show = false;
      state.error = '';
      publish();
    } catch (error) {
      if (!disposed) {
        fallback.show = true;
        fail('imagery', error);
      }
    }
  }
  async function setTerrain(on: boolean) {
    state.terrain = on;
    const run = ++terrainRun;
    try {
      const provider = on ? await C.createWorldTerrainAsync() : new C.EllipsoidTerrainProvider();
      if (disposed || run !== terrainRun) return;
      widget.scene.terrainProvider = provider;
      publish();
    } catch (error) {
      if (!disposed && run === terrainRun) {
        state.terrain = false;
        fail('terrain', error);
      }
    }
  }
  // Places with their own published 3D model: the generic OSM building box
  // at the same spot would poke through the model, so it is hidden there.
  let buildingMask: { lat: number; lon: number; radius: number }[] = [];
  function applyBuildingMask() {
    if (!tileset || tileset.isDestroyed()) return;
    const lat = '${feature["cesium#latitude"]}', lon = '${feature["cesium#longitude"]}';
    const terms = buildingMask.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => {
      const dLat = p.radius / 111320, dLon = p.radius / (111320 * Math.max(0.01, Math.cos(p.lat * Math.PI / 180)));
      return `(abs(${lat} - ${p.lat}) < ${dLat} && abs(${lon} - ${p.lon}) < ${dLon})`;
    });
    tileset.style = terms.length ? new C.Cesium3DTileStyle({ show: `!(${terms.join(' || ')})` }) : undefined;
  }
  /** Hide OSM buildings whose footprint centre lies within `radius` metres of each point. */
  function hideBuildingsAt(points: { lat: number; lon: number; radius?: number }[]) {
    buildingMask = points.map(p => ({ lat: p.lat, lon: p.lon, radius: p.radius ?? 15 }));
    applyBuildingMask();
  }
  async function setBuildings(on: boolean) {
    // OSM Buildings are placed relative to World Terrain, so they need it.
    if (on && !state.terrain) void setTerrain(true);
    state.buildings = on;
    publish();
    try {
      if (on) {
        tilesetRun ??= C.createOsmBuildingsAsync().then(created => {
          if (disposed) {
            created.destroy();
            throw new Error('disposed');
          }
          tileset = created;
          // Default tileset cache is 512 MB; buildings are a close-range detail, so keep a smaller, coarser budget.
          created.cacheBytes = 192 * 1024 * 1024;
          created.maximumCacheOverflowBytes = 64 * 1024 * 1024;
          created.maximumScreenSpaceError = 24;
          applyBuildingMask();
          widget.scene.primitives.add(created);
          return created;
        });
        const created = await tilesetRun;
        if (!disposed) created.show = state.buildings;
      } else if (tileset) tileset.show = false;
      publish();
    } catch (error) {
      tilesetRun = undefined;
      if (!disposed) {
        state.buildings = false;
        fail('buildings', error);
      }
    }
  }
  /** The globe's single "3D" button: Cesium World Terrain + Cesium OSM
   * Buildings together (buildings are placed on that terrain). */
  async function setRelief3D(on: boolean) {
    if (on) { await setTerrain(true); await setBuildings(true); }
    else { await setBuildings(false); await setTerrain(false); }
  }
  function dispose() {
    disposed = true;
    if (widget.isDestroyed()) return;
    for (const layer of Object.values(layers)) if (layer && !layer.isDestroyed()) widget.scene.imageryLayers.remove(layer, true);
    if (tileset && !tileset.isDestroyed()) {
      widget.scene.primitives.remove(tileset);
    }
    widget.scene.terrainProvider = new C.EllipsoidTerrainProvider();
  }
  const subscribe = (listener: (state: EarthStreamingState) => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  return { state, subscribe, setBasemap, setTerrain, setBuildings, setRelief3D, hideBuildingsAt, dispose, tileset: () => tileset };
}
