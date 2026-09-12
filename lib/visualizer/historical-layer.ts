import { Group } from 'three';
import type { LineSegments } from 'three';
import { createCountryHighlight, disposeCountryHighlight } from './country-highlight';
import type { Country } from './countries';
import { historicalPalette, type HistoricalTerritory } from './historical-territories';

/** Reuse the existing spherical triangulator (holes + disjoint polygons), not a new renderer. */
export function createHistoricalLayer(territory: HistoricalTerritory) {
  const polygons = territory.geometry.type === 'Polygon' ? [territory.geometry.coordinates] : territory.geometry.coordinates;
  const country: Country = {
    info: { code: territory.id, iso2: null, iso3: null, name: territory.name, continent: '', capital: null, representative: territory.anchor },
    feature: { geometry: territory.geometry }, point: { latitude: territory.anchor[1], longitude: territory.anchor[0] }, angularExtent: 0,
    polygons: polygons.map(rings => ({ rings, bbox: [0,0,0,0], area: 0 })),
  };
  const layer = createCountryHighlight(country);
  layer.group.name = `HistoricalTerritory:${territory.id}`;
  layer.anchor.visible = false;
  const palette = historicalPalette(territory);
  layer.fill.material.color.set(palette.fill);
  layer.outline.material.color.set(palette.border);
  // Keep both layers above modern borders without hiding their satellite texture.
  layer.fill.geometry.scale(1.0015,1.0015,1.0015);
  layer.outline.geometry.scale(1.002,1.002,1.002);
  layer.fill.renderOrder = 2; layer.outline.renderOrder = 3;
  layer.fill.material.opacity = 0; layer.outline.material.opacity = 0;
  return layer;
}

/** Two cached prototypes; opacity only in the existing RAF. No extra animation loop. */
export function createHistoricalController(frame: Group, borders: LineSegments) {
  const root = new Group(); root.name = 'HistoricalTerritories'; frame.add(root);
  const cache = new Map<string, { layer: ReturnType<typeof createHistoricalLayer>; opacity: number; from: number; to: number; start: number }>();
  let activeId: string | null = null;
  function select(territory: HistoricalTerritory | null, now: number, reduced: boolean) {
    const id = territory?.id ?? null;
    if (id === activeId) return;
    activeId = id;
    if (territory && !cache.has(territory.id)) {
      const layer = createHistoricalLayer(territory); root.add(layer.group);
      cache.set(territory.id, { layer, opacity: 0, from: 0, to: 0, start: now });
    }
    for (const [key, entry] of cache) {
      entry.from = entry.opacity; entry.to = key === id ? 1 : 0; entry.start = reduced ? now - 400 : now;
    }
    tick(now);
  }
  function tick(now: number) {
    root.position.copy(borders.position);
    const radius = Number(borders.userData.earthRadius);
    root.scale.setScalar(Number.isFinite(radius) && radius > 0 ? radius : 1);
    // Terrain hides modern borders; historical globe geometry follows that visibility.
    root.visible = frame.visible;
    for (const [id, entry] of cache) {
      const t = Math.max(0, Math.min(1, (now - entry.start) / 400));
      entry.opacity = entry.from + (entry.to - entry.from) * t * t * (3 - 2*t);
      entry.layer.group.visible = entry.opacity > 0;
      entry.layer.fill.material.opacity = entry.opacity * .30;
      entry.layer.outline.material.opacity = entry.opacity * .96;
      if (cache.size > 3 && entry.opacity === 0 && id !== activeId) {
        root.remove(entry.layer.group); disposeCountryHighlight(entry.layer); cache.delete(id);
      }
    }
  }
  function dispose() { for (const entry of cache.values()) disposeCountryHighlight(entry.layer); cache.clear(); root.clear(); frame.remove(root); }
  return { select, tick, dispose, root };
}
