import { describe, expect, it } from 'vitest';
import { haversineDistanceKm, spreadCollidingMarkers, MARKER_CLUSTER_RADIUS_KM } from './marker-clustering';

const bethlehem = { id: 'nativity', latitude: 31.7054, longitude: 35.2024, title: 'Nativity', date: '' };
const jerusalem = { id: 'crucifixion', latitude: 31.7683, longitude: 35.2137, title: 'Crucifixion', date: '' };
const nicaea = { id: 'nicaea', latitude: 40.4297, longitude: 29.7231, title: 'Nicaea', date: '' };
const constantinople = { id: 'constantinople', latitude: 41.0082, longitude: 28.9784, title: 'Constantinople', date: '' };

function pairwiseDistancesKm(points: { latitude: number; longitude: number }[]): number[] {
  const distances: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) distances.push(haversineDistanceKm(points[i], points[j]));
  }
  return distances;
}

describe('haversineDistanceKm', () => {
  it('matches the known real-world separation of Bethlehem and Jerusalem', () => {
    expect(haversineDistanceKm(bethlehem, jerusalem)).toBeCloseTo(7.1, 0);
  });
  it('matches the known real-world separation of Nicaea and Constantinople', () => {
    expect(haversineDistanceKm(nicaea, constantinople)).toBeCloseTo(89.9, 0);
  });
});

describe('spreadCollidingMarkers', () => {
  it('leaves isolated points at their exact original coordinates', () => {
    const result = spreadCollidingMarkers([nicaea, constantinople]);
    expect(result.find((point) => point.id === 'nicaea')).toMatchObject({ latitude: nicaea.latitude, longitude: nicaea.longitude });
    expect(result.find((point) => point.id === 'constantinople')).toMatchObject({ latitude: constantinople.latitude, longitude: constantinople.longitude });
  });

  it('separates two events at literally identical coordinates', () => {
    const same = { id: 'b', latitude: 10, longitude: 10, title: 'B', date: '' };
    const other = { id: 'a', latitude: 10, longitude: 10, title: 'A', date: '' };
    const result = spreadCollidingMarkers([other, same]);
    expect(haversineDistanceKm(result[0], result[1])).toBeGreaterThan(MARKER_CLUSTER_RADIUS_KM * 0.9);
  });

  it('separates the real Bethlehem/Jerusalem pair beyond the collision radius', () => {
    const result = spreadCollidingMarkers([bethlehem, jerusalem]);
    expect(haversineDistanceKm(result[0], result[1])).toBeGreaterThanOrEqual(MARKER_CLUSTER_RADIUS_KM * 0.9);
  });

  it('leaves the real Nicaea/Constantinople pair untouched', () => {
    const result = spreadCollidingMarkers([nicaea, constantinople]);
    expect(result.find((point) => point.id === 'nicaea')).toMatchObject({ latitude: nicaea.latitude, longitude: nicaea.longitude });
    expect(result.find((point) => point.id === 'constantinople')).toMatchObject({ latitude: constantinople.latitude, longitude: constantinople.longitude });
  });

  it('fully separates every pair in a larger synthetic cluster', () => {
    const cluster = [
      { id: 'c1', latitude: 30, longitude: 30, title: '1', date: '' },
      { id: 'c2', latitude: 30.02, longitude: 30.02, title: '2', date: '' },
      { id: 'c3', latitude: 29.98, longitude: 30.01, title: '3', date: '' },
      { id: 'c4', latitude: 30.01, longitude: 29.98, title: '4', date: '' },
    ];
    const result = spreadCollidingMarkers(cluster);
    for (const distance of pairwiseDistancesKm(result)) expect(distance).toBeGreaterThanOrEqual(MARKER_CLUSTER_RADIUS_KM * 0.9);
  });

  it('keeps the fanned-out cluster centered near the original centroid', () => {
    const cluster = [
      { id: 'x1', latitude: 50, longitude: 30, title: '1', date: '' },
      { id: 'x2', latitude: 50.01, longitude: 30.01, title: '2', date: '' },
    ];
    const result = spreadCollidingMarkers(cluster);
    const centroidLat = result.reduce((sum, point) => sum + point.latitude, 0) / result.length;
    const centroidLon = result.reduce((sum, point) => sum + point.longitude, 0) / result.length;
    expect(centroidLat).toBeCloseTo(50.005, 1);
    expect(centroidLon).toBeCloseTo(30.005, 1);
  });

  it('produces the same output set regardless of input array order', () => {
    const forward = spreadCollidingMarkers([bethlehem, jerusalem]).map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude })).sort((a, b) => a.id.localeCompare(b.id));
    const reversed = spreadCollidingMarkers([jerusalem, bethlehem]).map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude })).sort((a, b) => a.id.localeCompare(b.id));
    expect(reversed).toEqual(forward);
  });

  it('passes non-geo fields through unchanged', () => {
    const result = spreadCollidingMarkers([bethlehem, jerusalem]);
    expect(result.find((point) => point.id === 'nativity')).toMatchObject({ title: 'Nativity', date: '' });
    expect(result.find((point) => point.id === 'crucifixion')).toMatchObject({ title: 'Crucifixion', date: '' });
  });

  it('stays finite for a colliding pair near the pole', () => {
    const a = { id: 'p1', latitude: 89.99, longitude: 10, title: '1', date: '' };
    const b = { id: 'p2', latitude: 89.99, longitude: 10.01, title: '2', date: '' };
    const result = spreadCollidingMarkers([a, b]);
    for (const point of result) {
      expect(Number.isFinite(point.latitude)).toBe(true);
      expect(Number.isFinite(point.longitude)).toBe(true);
    }
  });
});
