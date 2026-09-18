import {describe, expect, it, vi} from 'vitest';
import {CustomDataSource, GeoJsonDataSource} from '@cesium/engine';
import {historicalTerritories} from '@/lib/visualizer/historical-territories';
import {createCesiumEvents} from './events';
import type {CesiumWidget} from '@cesium/engine';

vi.mock('@cesium/engine', async importOriginal => {
  const actual = await importOriginal<typeof import('@cesium/engine')>();
  return {...actual, ScreenSpaceEventHandler: class {
    setInputAction() {}
    destroy() {}
  }};
});

function setup() {
  const sources: {entities: {values: {id: string}[]}; show: boolean}[] = [];
  const widget = {canvas: {}, dataSources: {
    add: vi.fn(async source => {sources.push(source); return source;}), remove: vi.fn()
  }, camera: {flyTo: vi.fn()}, scene: {requestRender: vi.fn()}, isDestroyed: () => false};
  const layer = createCesiumEvents(widget as unknown as CesiumWidget, vi.fn(), vi.fn());
  return {layer, widget, sources};
}

describe('Cesium history event layer', () => {
  it('replaces filtered markers and excludes invalid coordinates', () => {
    const {layer, sources} = setup();
    layer.update([{id:'valid',latitude:46,longitude:7,title:'Event',date:'1000'},
      {id:'invalid',latitude:NaN,longitude:7,title:'Invalid',date:''}], null);
    expect(sources[0].entities.values.map(entity => entity.id)).toEqual(['event:valid']);
    layer.update([], null);
    expect(sources[0].entities.values).toHaveLength(0);
    layer.dispose();
  });
  it('flies only to located selections and renders their model', () => {
    const {layer, widget, sources} = setup();
    layer.focus({latitude:null,longitude:null});
    expect(widget.camera.flyTo).not.toHaveBeenCalled();
    const selected = {id:'church',latitude:46,longitude:7,modelUrl:'/church.glb'};
    layer.focus(selected);
    layer.update([], selected);
    expect(widget.camera.flyTo).toHaveBeenCalledOnce();
    expect(sources[0].entities.values.map(entity => entity.id)).toEqual(['selected-event-model']);
    layer.setVisible(false);
    expect(sources[0].show).toBe(false);
    layer.dispose();
  });
  it('rejects invalid selected coordinates and remains inert after disposal', () => {
    const {layer, widget, sources} = setup();
    for (const latitude of [NaN, Infinity, 91, -91]) {
      const selected = {latitude, longitude:7, modelUrl:'/church.glb'};
      layer.focus(selected); layer.update([], selected);
      expect(sources[0].entities.values).toHaveLength(0);
    }
    expect(widget.camera.flyTo).not.toHaveBeenCalled();
    layer.dispose(); layer.dispose();
    layer.focus({latitude:46,longitude:7});
    expect(widget.camera.flyTo).not.toHaveBeenCalled();
  });
  it('discards stale historical loads and preserves hidden state', async () => {
    const {layer, sources} = setup();
    let resolveFirst!: (value: GeoJsonDataSource) => void;
    const first = new CustomDataSource('first') as unknown as GeoJsonDataSource;
    const second = new CustomDataSource('second') as unknown as GeoJsonDataSource;
    const load = vi.spyOn(GeoJsonDataSource, 'load')
      .mockImplementationOnce(() => new Promise(resolve => {resolveFirst = resolve;}))
      .mockResolvedValueOnce(second);
    try {
      const pending = layer.territory(historicalTerritories[0]);
      layer.setVisible(false);
      await layer.territory(historicalTerritories[1] ?? historicalTerritories[0]);
      resolveFirst(first); await pending;
      expect(sources).toContain(second);
      expect(sources).not.toContain(first);
      expect(second.show).toBe(false);
      layer.setVisible(true);
      expect(second.show).toBe(true);
      layer.dispose();
    } finally { load.mockRestore(); }
  });
});
