import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, Object3D } from 'three';
import { latLngToVector3 } from './geography';

type Position = [number, number];
type Polygon = Position[][];
export type CountryData = { type: 'FeatureCollection'; features: { properties?: { name: string; code?: string | null }; geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] } }[] };
export const BORDER_RADIUS_FACTOR = 1.003;
let dataset: Promise<CountryData> | undefined;
export function loadCountryBorders(): Promise<CountryData> {
  // Only CPU data is shared. Each scene owns/disposes its GPU resources.
  return dataset ??= fetch('/data/country-borders-50m.geojson').then((response) => {
    if (!response.ok) throw new Error(`Country borders: HTTP ${response.status}`);
    return response.json() as Promise<CountryData>;
  }).catch((error) => { dataset = undefined; throw error; });
}

/** Independent segments prevent bridges between islands/rings. Short spherical
 * interpolation crosses ±180 on the short arc; subdivision keeps every chord
 * above the Earth at our 0.3% offset, even on simplified polar boundaries. */
export function countryBorderPositions(data: CountryData): Float32Array {
  const positions: number[] = [];
  const seen = new Set<string>();
  const key = ([lon, lat]: Position) => `${((lon + 180) % 360 + 360) % 360 - 180},${lat}`;
  for (const { geometry } of data.features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const ak = key(a), bk = key(b);
        const segmentKey = ak < bk ? `${ak}:${bk}` : `${bk}:${ak}`;
        if (ak === bk || seen.has(segmentKey)) continue;
        seen.add(segmentKey);
        const start = latLngToVector3(a[1], a[0], 1), end = latLngToVector3(b[1], b[0], 1);
        const angle = start.angleTo(end);
        const steps = Math.max(1, Math.ceil(angle / (Math.PI / 180)));
        let previous = start;
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const next = angle < 1e-8 ? end : start.clone().multiplyScalar(Math.sin((1 - t) * angle)).addScaledVector(end, Math.sin(t * angle)).normalize();
          positions.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
          previous = next;
        }
      }
    }
  }
  return new Float32Array(positions);
}

export function createCountryBorders(data: CountryData) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(countryBorderPositions(data), 3));
  geometry.computeBoundingSphere();
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color: 0xe6d5a8, transparent: true, opacity: 0.26, depthTest: true, depthWrite: false, toneMapped: false }));
  lines.name = 'CountryBorders';
  return lines;
}

/** Measure only the solid Earth surface, excluding clouds, atmosphere and sky. */
export function measureEarthSurface(surface: Object3D) {
  const mesh = surface as Mesh;
  if (!mesh.geometry) throw new Error('Earth surface has no geometry');
  mesh.geometry.computeBoundingSphere();
  surface.updateWorldMatrix(true, false);
  const sphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(surface.matrixWorld);
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) throw new Error('Invalid Earth radius');
  return { center: sphere.center, radius: sphere.radius };
}

export function fitCountryBorders(layer: Object3D, surface: Object3D) {
  const { center, radius } = measureEarthSurface(surface);
  layer.position.copy(center);
  layer.scale.setScalar(radius * BORDER_RADIUS_FACTOR);
  layer.userData.earthRadius = radius;
}

export const CALIBRATION_POINTS = [
  { name: 'Equator / 0°', latitude: 0, longitude: 0 },
  { name: 'North Pole', latitude: 90, longitude: 0 },
  { name: 'Greenwich', latitude: 51.4779, longitude: 0 },
  { name: 'Kyiv', latitude: 50.4501, longitude: 30.5234 },
  { name: 'Rome', latitude: 41.9028, longitude: 12.4964 },
  { name: 'Jerusalem', latitude: 31.7683, longitude: 35.2137 },
];
