export type GeoPoint = { latitude: number; longitude: number };

const KM_PER_DEGREE_LATITUDE = 111.32;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometers (haversine). */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Below this real-world separation, pins are considered visually colliding
 * at the globe's current pin size and get fanned out. Sits between the
 * closest published pair that must separate (Bethlehem/Jerusalem, ~7.1km)
 * and the closest pair that must not be touched (Nicaea/Constantinople,
 * ~89.9km). */
export const MARKER_CLUSTER_RADIUS_KM = 20;

/** Fans out any group of points within `radiusKm` of each other into a
 * small evenly-spaced ring around their shared centroid, so overlapping
 * pins stay individually visible and clickable. Points with no collisions
 * keep their exact original latitude/longitude. Deterministic regardless
 * of input array order; returns a new array, same length and order as
 * `points`; non-geo fields pass through untouched. */
export function spreadCollidingMarkers<T extends GeoPoint & { id: string }>(
  points: T[],
  radiusKm: number = MARKER_CLUSTER_RADIUS_KM
): T[] {
  const byId = new Map(points.map((point) => [point.id, point]));
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const assigned = new Set<string>();
  const output = new Map<string, GeoPoint>();

  for (const seed of sorted) {
    if (assigned.has(seed.id)) continue;
    const cluster = sorted.filter((point) => !assigned.has(point.id) && haversineDistanceKm(seed, point) <= radiusKm);
    for (const member of cluster) assigned.add(member.id);

    if (cluster.length === 1) {
      output.set(seed.id, { latitude: seed.latitude, longitude: seed.longitude });
      continue;
    }

    const centroidLat = cluster.reduce((sum, point) => sum + point.latitude, 0) / cluster.length;
    const centroidLon = cluster.reduce((sum, point) => sum + point.longitude, 0) / cluster.length;
    const cosLat = Math.max(Math.cos(toRadians(centroidLat)), 0.01);

    cluster.forEach((member, index) => {
      const angle = (2 * Math.PI * index) / cluster.length;
      const deltaLat = (radiusKm * Math.cos(angle)) / KM_PER_DEGREE_LATITUDE;
      const deltaLon = (radiusKm * Math.sin(angle)) / (KM_PER_DEGREE_LATITUDE * cosLat);
      output.set(member.id, { latitude: centroidLat + deltaLat, longitude: centroidLon + deltaLon });
    });
  }

  return points.map((point) => {
    const placed = output.get(point.id)!;
    const original = byId.get(point.id)!;
    return { ...original, latitude: placed.latitude, longitude: placed.longitude };
  });
}
