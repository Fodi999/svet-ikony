// Shared pure contract: identical source in backend lib/terrain/contract.ts.
// No filesystem, credentials or storage. Node 24 and esbuild can consume this TS.
export const MAX_TERRAIN_TILE_BYTES = 50 * 1024 * 1024;
export const MAX_TERRAIN_MANIFEST_BYTES = 1024 * 1024;
export const MAX_TERRAIN_TOTAL_BYTES = 1024 * 1024 * 1024;
export type TerrainTile = {
  tile_id: string;
  lod: number;
  x: number;
  y: number;
  file: string;
  file_size_bytes: number;
  sha256: string;
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  [key: string]: unknown;
};
export type TerrainManifest = {
  region: string;
  grid: { lod: number; countX: number; countY: number; [key: string]: unknown };
  tiles: TerrainTile[];
  [key: string]: unknown;
};
const fail = (message: string): never => {
  throw new Error("Terrain: " + message);
};
function obj(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail(name + " must be an object");
  return v as Record<string, unknown>;
}
function num(v: unknown, name: string, min: number, max: number, integer = false): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isSafeInteger(v))
  )
    return fail("invalid " + name);
  return v;
}
function near(a: number, b: unknown, name: string) {
  if (typeof b !== "number" || !Number.isFinite(b) || Math.abs(a - b) > 1e-7)
    fail("inconsistent " + name);
}
function bounds(value: Record<string, unknown>, keys: string[]) {
  const a = num(value[keys[0]], keys[0], -180, 180),
    b = num(value[keys[1]], keys[1], -90, 90),
    c = num(value[keys[2]], keys[2], -180, 180),
    d = num(value[keys[3]], keys[3], -90, 90);
  if (c <= a || d <= b) fail("inverted bounds (antimeridian bundles require a future contract)");
  return [a, b, c, d];
}
export function terrainPrefix(region: string, lod: number): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(region) || ![1, 2, 3].includes(lod)) fail("invalid region/LOD");
  return `terrain/${region}/L${lod}/`;
}
export function parseTerrainManifest(input: unknown): TerrainManifest {
  const m = obj(input, "manifest");
  if (typeof m.region !== "string") fail("region required");
  const g = obj(m.grid, "grid");
  const lod = num(g.lod, "LOD", 1, 3, true);
  terrainPrefix(m.region as string, lod);
  const nx = num(g.countX, "countX", 1, 64, true),
    ny = num(g.countY, "countY", 1, 64, true);
  if (nx * ny > 256) fail("at most 256 tiles per bundle");
  if (g.xDirection !== "east" || g.yDirection !== "south")
    fail("grid directions must be east/south");
  if (g.baseCountX !== undefined)
    near(num(g.baseCountX, "baseCountX", 1, 64, true) * 2 ** (lod - 1), nx, "LOD/countX");
  if (g.baseCountY !== undefined)
    near(num(g.baseCountY, "baseCountY", 1, 64, true) * 2 ** (lod - 1), ny, "LOD/countY");
  const [west, south, east, north] = bounds(obj(m.bounds, "bounds"), [
    "minLon",
    "minLat",
    "maxLon",
    "maxLat",
  ]);
  const dx = (east - west) / nx,
    dy = (north - south) / ny;
  if (g.tileDegreesLon !== undefined) near(dx, g.tileDegreesLon, "tileDegreesLon");
  if (g.tileDegreesLat !== undefined) near(dy, g.tileDegreesLat, "tileDegreesLat");
  const c = obj(m.coordinateSystem, "coordinateSystem");
  if (
    c.east !== "+X" ||
    c.north !== "-Z" ||
    c.up !== "+Y" ||
    c.projection !== "spherical AEQD + spherical sag"
  )
    fail("unsupported coordinate system");
  const origin = obj(c.origin, "coordinate origin");
  num(origin.latitude, "origin latitude", -90, 90);
  num(origin.longitude, "origin longitude", -180, 180);
  num(c.metersPerUnit, "metersPerUnit", Number.MIN_VALUE, 1e9);
  num(c.earthRadiusMeters, "earthRadiusMeters", 1e6, 1e8);
  num(c.heightExaggeration, "heightExaggeration", 0, 100);
  if (
    c.vertexCoordinates !==
    "baked regional coordinates; identity object transforms, no independent tile recentering"
  )
    fail("unsupported vertex coordinate convention");
  if (
    c.blenderEast !== undefined &&
    (c.blenderEast !== "+X" || c.blenderNorth !== "+Y" || c.blenderUp !== "+Z")
  )
    fail("invalid Blender axes");
  if (!Array.isArray(m.tiles) || m.tiles.length !== nx * ny)
    fail("missing tiles or grid count mismatch");
  const ids = new Set<string>(),
    positions = new Set<string>(),
    files = new Set<string>();
  let total = 0;
  for (const value of m.tiles as unknown[]) {
    const t = obj(value, "tile");
    if (typeof t.tile_id !== "string" || !/^l[123]_\d+_\d+$/.test(t.tile_id))
      fail("invalid tile ID");
    if (ids.has(t.tile_id as string)) fail("duplicate tile ID");
    ids.add(t.tile_id as string);
    const x = num(t.x, "tile x", 0, nx - 1, true),
      y = num(t.y, "tile y", 0, ny - 1, true);
    if (positions.has(`${x}_${y}`)) fail("duplicate x/y");
    positions.add(`${x}_${y}`);
    if (t.lod !== lod || t.tile_id !== `l${lod}_${x}_${y}`) fail("tile ID/LOD/x/y mismatch");
    if (typeof t.file !== "string" || !/^[a-zA-Z0-9_-]+\.glb$/i.test(t.file))
      fail("unsafe tile filename/extension");
    if (files.has(t.file as string)) fail("duplicate tile file");
    files.add(t.file as string);
    if (t.mimeType !== undefined && t.mimeType !== "model/gltf-binary")
      fail("invalid declared tile MIME");
    num(t.file_size_bytes, "file size", 20, MAX_TERRAIN_TILE_BYTES, true);
    total += t.file_size_bytes as number;
    if (typeof t.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(t.sha256)) fail("invalid SHA-256");
    const [tw, ts, te, tn] = bounds(t, ["min_lon", "min_lat", "max_lon", "max_lat"]);
    near(west + x * dx, tw, "tile west");
    near(west + (x + 1) * dx, te, "tile east");
    near(north - y * dy, tn, "tile north");
    near(north - (y + 1) * dy, ts, "tile south");
    if (t.center_lat !== undefined) near((ts + tn) / 2, t.center_lat, "center_lat");
    if (t.center_lon !== undefined) near((tw + te) / 2, t.center_lon, "center_lon");
    if (
      JSON.stringify(t.world_position) !== "[0,0,0]" ||
      JSON.stringify(t.world_scale) !== "[1,1,1]"
    )
      fail("tile must retain shared identity transform");
  }
  if (total > MAX_TERRAIN_TOTAL_BYTES) fail("bundle exceeds 1 GiB limit");
  if (m.total_glb_bytes !== undefined) near(total, m.total_glb_bytes, "total_glb_bytes");
  return m as TerrainManifest;
}
export function remoteTerrainManifest(input: unknown): TerrainManifest {
  const m = parseTerrainManifest(input);
  return { ...m, tiles: m.tiles.map((t) => ({ ...t, file: `${t.x}_${t.y}.glb` })) };
}
export function validateTerrainGlbMetadata(input: unknown, tile: TerrainTile) {
  const doc = obj(input, "glTF");
  if (doc.nodes !== undefined && !Array.isArray(doc.nodes)) fail("invalid glTF nodes");
  for (const node of (doc.nodes ?? []) as unknown[]) {
    const n = obj(node, "glTF node");
    for (const [key, identity] of Object.entries({
      translation: [0, 0, 0],
      scale: [1, 1, 1],
      rotation: [0, 0, 0, 1],
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    })) {
      if (n[key] !== undefined && JSON.stringify(n[key]) !== JSON.stringify(identity))
        fail("GLB does not use declared baked identity transforms");
    }
    if (n.extras) {
      const e = obj(n.extras, "glTF extras");
      for (const key of ["tile_id", "lod", "x", "y", "min_lat", "max_lat", "min_lon", "max_lon"]) {
        if (e[key] !== undefined && e[key] !== tile[key])
          fail("GLB metadata differs from manifest: " + key);
      }
    }
  }
}
