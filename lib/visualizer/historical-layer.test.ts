import { describe, it, expect, vi } from 'vitest';
import { Group, LineSegments } from 'three';
import { historicalTerritories, territoryForEvent, atlasMessages, eventImage } from './historical-territories';
import { createHistoricalController, createHistoricalLayer } from './historical-layer';
import { disposeCountryHighlight } from './country-highlight';
import type { ChurchVisualizerEventDto } from '@/lib/types';
const event = (year: number, latitude: number, longitude: number) => ({ status: 'published', yearStart: year, latitude, longitude } as ChurchVisualizerEventDto);
const [byzantium, rus] = historicalTerritories;
describe('historical context', () => {
  it('resolves by time and geography, independent of event title or locale', () => {
    expect(territoryForEvent(event(1453,41.0082,28.9784))).toBe(byzantium);
    expect(territoryForEvent(event(988,50.4501,30.5234))).toBe(rus);
    expect(territoryForEvent(event(325,40.4297,29.7231))).toBeNull();
    expect(territoryForEvent(event(1453,0,0))).toBeNull();
    expect(territoryForEvent({...event(1453,41.0082,28.9784), status:'draft'})).toBeNull();
    expect(territoryForEvent(null)).toBeNull();
    expect(territoryForEvent({...event(988,50.45,30.52),calendarEra:'BC'})).toBeNull();
  });
  it.each(['uk','ru','en'] as const)('has localized names and reconstruction/source disclosure: %s', locale => {
    for (const territory of historicalTerritories) expect(territory.name[locale].length).toBeGreaterThan(5);
    expect(atlasMessages[locale].reconstruction.length).toBeGreaterThan(50);
    expect(rus.source.year).toBe(1000); expect(byzantium.source.kind).toBe('manual-local-prototype');
  });
  it('accepts safe optional image URLs without mutating API data', () => {
    const e = event(988,50,30);
    expect(eventImage(e)).toBeNull();
    expect(eventImage({...e,imageUrl:'/media/a.png'} as typeof e)).toBe('/media/a.png');
    for (const imageUrl of ['javascript:alert(1)','data:image/svg+xml,test','//evil.test','https://user:pass@example.com']) expect(eventImage({...e,imageUrl} as typeof e)).toBeNull();
  });
});
describe('historical runtime', () => {
  function setup() { const frame = new Group(), borders = new LineSegments(); borders.userData.earthRadius = 1.8; const controller = createHistoricalController(frame,borders); return {frame,controller}; }
  it('fades old territory out and new one in; caches the same geometry', () => {
    const {controller} = setup(); controller.select(byzantium,0,false); controller.tick(400);
    const first = controller.root.children[0];
    controller.select(rus,400,false); controller.tick(600);
    expect(first.visible).toBe(true); expect(controller.root.children[1].visible).toBe(true);
    controller.tick(800); expect(first.visible).toBe(false);
    controller.select(byzantium,800,false); controller.tick(1200);
    expect(controller.root.children[0]).toBe(first); expect(controller.root.children.length).toBe(2);
    expect(controller.root.scale.x).toBe(1.8); controller.dispose();
  });
  it('clears safely with no territory and respects reduced motion immediately', () => {
    const {controller} = setup(); controller.select(byzantium,0,true);
    expect(controller.root.children[0].visible).toBe(true);
    controller.select(null,1,true); expect(controller.root.children[0].visible).toBe(false); controller.dispose();
  });
  it('keeps modern layers untouched and disposes every GPU resource', () => {
    const {frame,controller} = setup(); const modern = new Group(); frame.add(modern);
    controller.select(rus,0,true);
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    controller.root.traverse(object => {
      const mesh = object as import('three').Mesh;
      if (mesh.geometry) spies.push(vi.spyOn(mesh.geometry,'dispose'));
      if (mesh.material && !Array.isArray(mesh.material)) spies.push(vi.spyOn(mesh.material,'dispose'));
    });
    controller.dispose(); expect(frame.children).toEqual([modern]);
    expect(spies.length).toBe(6); for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
  it('builds finite curved MultiPolygon fill above Earth without changing source data', () => {
    const before = JSON.stringify(rus); const layer = createHistoricalLayer(rus);
    const positions = layer.fill.geometry.getAttribute('position'); expect(positions.count).toBeGreaterThan(3);
    for(let i=0;i<positions.count;i++) expect(Math.hypot(positions.getX(i),positions.getY(i),positions.getZ(i))).toBeCloseTo(1.005,3);
    expect(JSON.stringify(rus)).toBe(before); disposeCountryHighlight(layer);
  });
});
