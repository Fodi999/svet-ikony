import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseTerrainManifest, type TerrainManifest, type TerrainTile } from '../terrain/contract';

export type LoadedManifest = TerrainManifest & { sourceUrl: string };
export type TerrainProgress = { loaded: number; total: number; bytes: number; failed: string[] };
export function disposeTerrainObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  root.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materials.add(mat); for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value); } });
  textures.forEach(value => { const image = value.source?.data; if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close(); value.dispose(); });
  materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose()); root.removeFromParent();
}
export async function loadTerrainManifest(url: string, signal?: AbortSignal): Promise<LoadedManifest> {
  const absolute = new URL(url, window.location.href);
  if (absolute.origin !== window.location.origin) throw new Error('Terrain must use this LOCAL origin');
  const response = await fetch(absolute, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]), redirect: 'error' });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('Terrain manifest unavailable');
  const manifest = parseTerrainManifest(await response.json());
  if (manifest.grid.lod !== 1) throw new Error('Only L1 rendering is enabled');
  return { ...manifest, sourceUrl: absolute.href };
}
export async function fetchTerrainTileBytes(tile: TerrainTile, manifest: LoadedManifest, signal?: AbortSignal) {
  const url = new URL(tile.file, manifest.sourceUrl);
  const response = await fetch(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]), redirect: 'error' });
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'model/gltf-binary') throw new Error(`Tile MIME/HTTP: ${tile.tile_id}`);
  const bytes = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== tile.file_size_bytes || hash !== tile.sha256) throw new Error(`Tile integrity: ${tile.tile_id}`);
  signal?.throwIfAborted();
  return bytes;
}
export async function decodeTerrainTile(bytes:ArrayBuffer,tile:TerrainTile,manifest:LoadedManifest,signal?:AbortSignal) {
  const url = new URL(tile.file,manifest.sourceUrl);
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
  if (signal?.aborted) { disposeTerrainObject(gltf.scene); signal.throwIfAborted(); }
  // The manifest declares baked coordinates. Apply declared object transforms once,
  // without normalizing, recentering or modifying any geometry.
  gltf.scene.position.fromArray(tile.world_position as number[]);
  gltf.scene.scale.fromArray(tile.world_scale as number[]);
  gltf.scene.name = tile.tile_id;
  return gltf.scene;
}
export async function loadTerrainTile(tile:TerrainTile,manifest:LoadedManifest,signal?:AbortSignal) {
  return decodeTerrainTile(await fetchTerrainTileBytes(tile,manifest,signal),tile,manifest,signal);
}
export class TerrainLoader {
  private abort = new AbortController();
  private root: THREE.Group | null = null;
  private pending: Promise<THREE.Group> | null = null;
  constructor(private progress: (value: TerrainProgress) => void) {}
  loadTerrainManifest(url: string) { return loadTerrainManifest(url, this.abort.signal); }
  loadTerrainTile(tile: TerrainTile, manifest: LoadedManifest) { return loadTerrainTile(tile, manifest, this.abort.signal); }
  loadTerrainLevel(manifest: LoadedManifest): Promise<THREE.Group> {
    if (this.pending) return this.pending;
    const root = new THREE.Group(); root.name = 'TerrainRoot'; this.root = root;
    const state: TerrainProgress = { loaded: 0, total: manifest.tiles.length, bytes: 0, failed: [] };
    this.pending = (async () => {
      // Bounded decoding limits transient texture memory on mobile.
      for (const tile of manifest.tiles) {
        try { const scene = await this.loadTerrainTile(tile, manifest); root.add(scene); state.loaded++; state.bytes += tile.file_size_bytes; this.progress({ ...state, failed: [...state.failed] }); }
        catch (error) { state.failed.push(tile.tile_id); this.progress({ ...state, failed: [...state.failed] }); throw error; }
      }
      return root;
    })().catch(error => { disposeTerrainObject(root); this.root = null; throw error; });
    return this.pending;
  }
  unloadTerrainLevel() { this.abort.abort(); if (this.root) disposeTerrainObject(this.root); this.root = null; this.pending = null; }
}
