import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { BORDER_RADIUS_FACTOR, countryBorderPositions, createCountryBorders, fitCountryBorders, loadCountryBorders, measureEarthSurface, type CountryData } from './country-borders';
import { latLngToVector3 } from './geography';
const country = (coordinates: [number, number][][]): CountryData => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates } }] });
afterEach(() => vi.unstubAllGlobals());
describe('geographic calibration', () => {
  it('uses north +Y, Greenwich +Z, east +X, consistent for every overlay', () => {
    expect(latLngToVector3(90, 0, 2).distanceTo(new Vector3(0, 2, 0))).toBeLessThan(1e-10);
    expect(latLngToVector3(0, 0, 2).distanceTo(new Vector3(0, 0, 2))).toBeLessThan(1e-10);
    expect(latLngToVector3(0, 90, 2).distanceTo(new Vector3(2, 0, 0))).toBeLessThan(1e-10);
  });
  it('measures the transformed solid surface, ignoring child atmosphere/sky', () => {
    const parent = new Group(); parent.scale.setScalar(1.7); parent.position.set(3, 2, 1);
    const surface = new Mesh(new SphereGeometry(2, 32, 24)); parent.add(surface);
    surface.add(new Mesh(new SphereGeometry(100)));
    const measurement = measureEarthSurface(surface);
    expect(measurement.radius).toBeCloseTo(3.4);
    expect(measurement.center.toArray()).toEqual([3, 2, 1]);
    const layer = new Group(); fitCountryBorders(layer, surface);
    expect(layer.scale.x).toBeCloseTo(3.4 * BORDER_RADIUS_FACTOR);
  });
});
describe('country boundary geometry', () => {
  it('does not join islands or interior rings and deduplicates shared borders', () => {
    const a: [number, number][] = [[0, 0], [1, 0]];
    const b: [number, number][] = [[50, 0], [51, 0]];
    const data: CountryData = { type: 'FeatureCollection', features: [
      { geometry: { type: 'MultiPolygon', coordinates: [[a], [b]] } },
      { geometry: { type: 'Polygon', coordinates: [[...a].reverse()] } },
    ] };
    const points = countryBorderPositions(data);
    expect(points.length).toBe(12); // two independent segments, shared edge only once
  });
  it('takes the short arc across the antimeridian and keeps chords above the surface', () => {
    const points = countryBorderPositions(country([[[179, 0], [-179, 0]]]));
    for (let i = 0; i < points.length; i += 6) {
      const a = new Vector3().fromArray(points, i), b = new Vector3().fromArray(points, i + 3);
      expect(a.z).toBeLessThan(-0.99);
      expect(a.angleTo(b)).toBeLessThanOrEqual(Math.PI / 180 + 1e-7);
      expect(a.add(b).multiplyScalar(BORDER_RADIUS_FACTOR / 2).length()).toBeGreaterThan(1);
    }
  });
  it('builds the bundled 50m dataset into one depth-tested draw, with finite short segments', () => {
    const data = JSON.parse(readFileSync(new URL('../../public/data/country-borders-50m.geojson', import.meta.url), 'utf8')) as CountryData;
    const layer = createCountryBorders(data);
    const points = layer.geometry.getAttribute('position');
    expect(data.features.length).toBe(242);
    expect(points.count).toBe(157440);
    expect(layer.material.depthTest).toBe(true);
    expect(layer.material.depthWrite).toBe(false);
    let maxRadiusError = 0, maxAngle = 0;
    for (let i = 0; i < points.count; i += 2) {
      const a = new Vector3().fromBufferAttribute(points, i), b = new Vector3().fromBufferAttribute(points, i + 1);
      maxRadiusError = Math.max(maxRadiusError, Math.abs(a.length() - 1), Math.abs(b.length() - 1));
      maxAngle = Math.max(maxAngle, a.angleTo(b));
    }
    expect(maxRadiusError).toBeLessThan(1e-6);
    expect(maxAngle).toBeLessThan(Math.PI / 180 + 1e-6);
    layer.geometry.dispose(); layer.material.dispose();
  });
  it('shares one fetch across concurrent consumers and later toggles', async () => {
    const data = country([[[0, 0], [1, 0]]]);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal('fetch', fetcher);
    const first = loadCountryBorders(); const second = loadCountryBorders();
    expect(first).toBe(second);
    expect(await first).toBe(data);
    await loadCountryBorders(); expect(fetcher).toHaveBeenCalledOnce();
  });
});
