/**
 * Sacred Plots pilot — data/geometry layer (framework-agnostic, no Cesium
 * import here on purpose: this module is pure math + deterministic mock
 * data, easy to unit-test and to later swap for a real DB-backed source
 * without touching any rendering code).
 *
 * IMPORTANT / DIGITAL TERRITORY DISCLAIMER: everything generated here is an
 * editorial "digital territory" product concept for the on-map experience.
 * It is NOT a cadastral survey and does NOT assert any physical/legal
 * ownership claim over real land. See SacredPlot.status/ownerId below and
 * the disclaimer copy shown in the UI panel (SacredPlotPanel).
 *
 * GRID NOTE: the original brief asked for H3 (resolution 13, ~44m² cells)
 * via the `h3-js` package. That package could not be installed in this
 * sandbox -- `npm install h3-js` was blocked by the organization's egress
 * policy (403 from the npm registry, both in the cloud container and on the
 * user's own machine) -- so this file implements its own small
 * self-contained axial pointy-top hex grid instead (`gridType:
 * 'axial-hex'`), tuned to the same average cell area H3 resolution 13
 * targets (~43.9m²) via `resolution` staying a same-shaped knob. h3-js is
 * NOT used anywhere in this codebase, so field names no longer pretend
 * otherwise: `gridCellId` is a plain `"q:r"` axial-coordinate string, not an
 * H3 index. Swapping in a real `h3-js`-backed grid later only means
 * rewriting `generateSacredPlots`'s body (and `axialAt` in
 * sacred-plots-layer.ts) -- `plotId` and every other field stay the same
 * shape, so rendering/picking/the panel don't need to change.
 */

export type SacredPlotStatus = 'available' | 'owned' | 'reserved';

export type LonLat = [number, number];

/** A territory's polygon geometry, as already used by
 * lib/cesium/sacred-places.ts's TerritoryFeature. Duplicated here (not
 * imported from that Cesium-facing file) so this module stays Cesium-free. */
export type TerritoryGeometry =
  | {type: 'Polygon'; coordinates: number[][][]}
  | {type: 'MultiPolygon'; coordinates: number[][][][]};

/** Future DB shape (see the schema sketch at the end of this file) -- an
 * "editorial digital territory" record, deliberately distinct from any
 * cadastral/legal boundary table. Not persisted anywhere yet; this pilot
 * derives it on the fly from calendar_geo_place_territories via the caller. */
export type SacredTerritory = {
  id: string;
  sacredPlaceId: string;
  geometry: TerritoryGeometry;
  kind: 'digital-territory';
};

export type SacredPlot = {
  plotId: string;
  /** Which grid algorithm produced this cell -- always `'axial-hex'` today,
   * see the GRID NOTE above (h3-js is not used). Kept as an explicit field
   * (rather than assumed) so a future real-H3 grid can coexist/migrate
   * cleanly. */
  gridType: 'axial-hex';
  /** This cell's key within its grid -- a plain `"q:r"` axial-coordinate
   * pair for `gridType: 'axial-hex'`, NOT an H3 cell index. */
  gridCellId: string;
  sacredPlaceId: string;
  parentPlaceId?: string;
  /** Nearest sacred place (by hex-center distance) among the candidates the
   * caller supplied -- usually the territory's own place or one of its
   * children (e.g. a hex near the cathedral resolves to Uspensky Sobor
   * rather than the Lavra complex as a whole). */
  associatedSacredPlaceId: string;
  areaM2: number;
  status: SacredPlotStatus;
  ownerId?: string;
  priceEUR?: number;
  displayNumber: number;
  center: {lat: number; lon: number};
  /** Closed ring, [lon,lat] pairs (GeoJSON winding), first point repeated last. */
  boundary: LonLat[];
};

/** Future DB shape -- not created/queried yet, see TODO schema below. */
export type SacredPlotOwnership = {
  plotId: string;
  ownerId: string;
  acquiredAt: string;
  priceEUR: number;
  txRef?: string;
};

/** Future DB shape -- not created/queried yet, see TODO schema below. */
export type SacredPlotListing = {
  plotId: string;
  priceEUR: number;
  currency: 'EUR';
  listedAt: string;
  status: 'active' | 'sold' | 'withdrawn';
};

// ---------------------------------------------------------------------------
// H3-resolution-equivalent average cell areas (m²), from H3's own published
// table (https://h3geo.org/docs/core-library/restable) -- used only to turn
// a "resolution" number into a target hex size for our custom grid, so the
// `resolution` knob means the same thing it would with real h3-js.
// ---------------------------------------------------------------------------
const H3_AVG_AREA_M2: Readonly<Record<number, number>> = {
  8: 737_327, 9: 105_332, 10: 15_047, 11: 2_149.0, 12: 307.09, 13: 43.87, 14: 6.267, 15: 0.895,
};
const DEFAULT_RESOLUTION = 13;

/** Deterministic 32-bit FNV-1a string hash -- used for every "random but
 * stable" mock value below (status/price/owner) so results never change
 * between reloads and never depend on Math.random(). */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const MOCK_PRICES_EUR = [49, 59, 79, 99] as const;

/** hash%10: 0-6 available (70%), 7-8 owned (20%), 9 reserved (10%) -- matches
 * the brief's "большинство available; несколько owned; несколько reserved". */
function mockStatus(plotId: string): SacredPlotStatus {
  const bucket = hash(plotId) % 10;
  return bucket < 7 ? 'available' : bucket < 9 ? 'owned' : 'reserved';
}
function mockPrice(plotId: string): number {
  return MOCK_PRICES_EUR[(hash(plotId) >>> 3) % MOCK_PRICES_EUR.length];
}
function mockOwnerId(plotId: string): string {
  return `owner-${hash('owner:' + plotId).toString(16).slice(0, 6)}`;
}

/** "place-kyiv-pechersk-lavra" -> "KPL". Generic (no hardcoded map): strips
 * a leading "place-", splits on "-", takes each word's first letter, caps at
 * 3 letters, upper-cased. Falls back to a hash-derived 3-letter code for any
 * id that doesn't yield at least one letter this way. */
function territoryCode(sacredPlaceId: string): string {
  const words = sacredPlaceId.replace(/^place-/, '').split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const code = words.map(word => word[0]).join('').slice(0, 3).toUpperCase();
  if (code.length >= 2) return code;
  return 'P' + hash(sacredPlaceId).toString(36).slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Local tangent-plane (equirectangular) projection. The pilot territory is
// ~600m across, so a flat-plane approximation centered on the polygon's own
// centroid introduces sub-centimeter distortion -- more than accurate enough
// for a hex-grid prototype, and far cheaper than a proper geodesic tiling.
// ---------------------------------------------------------------------------
const METERS_PER_DEG_LAT = 111_320;
function metersPerDegLon(atLat: number): number {
  return 111_320 * Math.cos((atLat * Math.PI) / 180);
}

type Projector = {toLocal(lon: number, lat: number): [number, number]; toLonLat(x: number, y: number): LonLat};
function makeProjector(originLon: number, originLat: number): Projector {
  const mLon = metersPerDegLon(originLat) || 1e-6;
  return {
    toLocal: (lon, lat) => [(lon - originLon) * mLon, (lat - originLat) * METERS_PER_DEG_LAT],
    toLonLat: (x, y) => [originLon + x / mLon, originLat + y / METERS_PER_DEG_LAT],
  };
}

function ringsOf(geometry: TerritoryGeometry): number[][][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

/** Even-odd ray-casting point-in-polygon test against every ring (so a hole
 * in a Polygon/MultiPolygon is respected); works directly in lon/lat degrees
 * since this is a topological test, not a distance computation. */
export function pointInPolygon(lon: number, lat: number, geometry: TerritoryGeometry): boolean {
  let inside = false;
  for (const ring of ringsOf(geometry)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}

export function boundsOf(geometry: TerritoryGeometry) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const ring of ringsOf(geometry)) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return {minLon, minLat, maxLon, maxLat};
}

const SQRT3 = Math.sqrt(3);

/** Regular hexagon area from its circumradius (edge length for a regular
 * hexagon equals its circumradius). */
function hexAreaFromSize(size: number): number {
  return ((3 * SQRT3) / 2) * size * size;
}

export type NearestPlaceCandidate = {id: string; lat: number; lon: number};

function nearestPlace(center: {lat: number; lon: number}, candidates: NearestPlaceCandidate[], fallback: string): string {
  let bestId = fallback, bestDist = Infinity;
  for (const candidate of candidates) {
    const dLat = (candidate.lat - center.lat) * METERS_PER_DEG_LAT;
    const dLon = (candidate.lon - center.lon) * metersPerDegLon(center.lat);
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) { bestDist = dist; bestId = candidate.id; }
  }
  return bestId;
}

export type GenerateSacredPlotsOptions = {
  territoryPolygon: TerritoryGeometry;
  sacredPlaceId: string;
  parentPlaceId?: string;
  /** H3-equivalent resolution, default 13 (~44m²/cell per the brief).
   * Configurable per the brief's "для pilot разрешить configurable
   * resolution" -- pass a smaller number (e.g. 11 or 12) for a coarser,
   * cheaper grid while iterating on the visuals. */
  resolution?: number;
  /** Places to resolve each hex's "associated sacred place" against
   * (typically the territory's own place plus its known children). Defaults
   * to just the territory's own place if omitted. */
  candidatePlaces?: NearestPlaceCandidate[];
};

/**
 * Splits a Sacred Place's territory polygon into a deterministic grid of
 * hexagonal Sacred Plots. Pure function of its inputs -- same territory +
 * sacredPlaceId + resolution always yields the exact same plots (same
 * plotId, h3Index, status, price, boundary) on every call, so callers are
 * free to cache/memoize by `${sacredPlaceId}:${resolution}` (the Cesium
 * rendering layer does exactly that -- see sacred-plots-layer.ts).
 */
export function generateSacredPlots(options: GenerateSacredPlotsOptions): SacredPlot[] {
  const {territoryPolygon, sacredPlaceId, parentPlaceId, resolution = DEFAULT_RESOLUTION} = options;
  const targetAreaM2 = H3_AVG_AREA_M2[resolution] ?? H3_AVG_AREA_M2[DEFAULT_RESOLUTION];
  const size = Math.sqrt(targetAreaM2 / ((3 * SQRT3) / 2));
  const bounds = boundsOf(territoryPolygon);
  if (!Number.isFinite(bounds.minLon)) return [];
  const originLon = (bounds.minLon + bounds.maxLon) / 2, originLat = (bounds.minLat + bounds.maxLat) / 2;
  const projector = makeProjector(originLon, originLat);
  const [xMin, yMin] = projector.toLocal(bounds.minLon, bounds.minLat);
  const [xMax, yMax] = projector.toLocal(bounds.maxLon, bounds.maxLat);

  const cellW = size * SQRT3, cellH = size * 1.5;
  const rMin = Math.floor(yMin / cellH) - 2, rMax = Math.ceil(yMax / cellH) + 2;
  const code = territoryCode(sacredPlaceId);
  const candidates = options.candidatePlaces?.length ? options.candidatePlaces : [{id: sacredPlaceId, lat: originLat, lon: originLon}];

  type RawCell = {q: number; r: number; x: number; y: number};
  const raw: RawCell[] = [];
  for (let r = rMin; r <= rMax; r++) {
    const qMinF = xMin / cellW - r / 2, qMaxF = xMax / cellW - r / 2;
    const qMin = Math.floor(qMinF) - 2, qMax = Math.ceil(qMaxF) + 2;
    for (let q = qMin; q <= qMax; q++) {
      const x = cellW * (q + r / 2), y = cellH * r;
      const [lon, lat] = projector.toLonLat(x, y);
      if (pointInPolygon(lon, lat, territoryPolygon)) raw.push({q, r, x, y});
    }
  }

  // Reading order: north row first, west-to-east within a row -- matches how
  // the reference mockup's plot numbers appear to read across the grid.
  raw.sort((a, b) => (b.r - a.r) || (a.q - b.q));

  const areaM2 = hexAreaFromSize(size);
  return raw.map((cell, index) => {
    const [lon, lat] = projector.toLonLat(cell.x, cell.y);
    const boundary: LonLat[] = [];
    for (let i = 0; i <= 6; i++) {
      const angle = (Math.PI / 180) * (60 * (i % 6) - 30);
      const [cLon, cLat] = projector.toLonLat(cell.x + size * Math.cos(angle), cell.y + size * Math.sin(angle));
      boundary.push([cLon, cLat]);
    }
    const displayNumber = index + 1;
    const plotId = `${code}-${String(displayNumber).padStart(6, '0')}`;
    const center = {lat, lon};
    return {
      plotId,
      gridType: 'axial-hex',
      gridCellId: `${cell.q}:${cell.r}`,
      sacredPlaceId,
      parentPlaceId,
      associatedSacredPlaceId: nearestPlace(center, candidates, sacredPlaceId),
      areaM2,
      status: mockStatus(plotId),
      ownerId: mockStatus(plotId) === 'owned' ? mockOwnerId(plotId) : undefined,
      priceEUR: mockPrice(plotId),
      displayNumber,
      center,
      boundary,
    };
  });
}

/*
 * ---------------------------------------------------------------------------
 * TODO -- future DB schema (NOT created now; no production migrations from
 * this pilot). Sketch only, so a later pass can wire generateSacredPlots'
 * output (or a real h3-js equivalent) to persisted rows without redesigning
 * the TypeScript shapes above:
 *
 * CREATE TABLE sacred_territories (
 *   id TEXT PRIMARY KEY,
 *   sacred_place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 *   geometry_type TEXT NOT NULL CHECK(geometry_type IN ('Polygon','MultiPolygon')),
 *   geometry_json TEXT NOT NULL CHECK(json_valid(geometry_json)),
 *   kind TEXT NOT NULL DEFAULT 'digital-territory' CHECK(kind='digital-territory'),
 *   resolution INTEGER NOT NULL,
 *   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 * );
 *
 * CREATE TABLE sacred_plots (
 *   plot_id TEXT PRIMARY KEY,
 *   territory_id TEXT NOT NULL REFERENCES sacred_territories(id),
 *   grid_type TEXT NOT NULL DEFAULT 'axial-hex',
 *   grid_cell_id TEXT NOT NULL,
 *   sacred_place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 *   associated_sacred_place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 *   area_m2 REAL NOT NULL,
 *   status TEXT NOT NULL CHECK(status IN ('available','owned','reserved')),
 *   display_number INTEGER NOT NULL,
 *   boundary_json TEXT NOT NULL CHECK(json_valid(boundary_json))
 * );
 * CREATE UNIQUE INDEX idx_sacred_plots_territory_cell ON sacred_plots(territory_id, grid_cell_id);
 *
 * CREATE TABLE sacred_plot_ownerships (
 *   plot_id TEXT PRIMARY KEY REFERENCES sacred_plots(plot_id),
 *   owner_id TEXT NOT NULL,
 *   acquired_at TEXT NOT NULL,
 *   price_eur_cents INTEGER NOT NULL,
 *   tx_ref TEXT
 * );
 *
 * CREATE TABLE sacred_plot_listings (
 *   plot_id TEXT PRIMARY KEY REFERENCES sacred_plots(plot_id),
 *   price_eur_cents INTEGER NOT NULL,
 *   currency TEXT NOT NULL DEFAULT 'EUR',
 *   listed_at TEXT NOT NULL,
 *   status TEXT NOT NULL CHECK(status IN ('active','sold','withdrawn'))
 * );
 * ---------------------------------------------------------------------------
 */
