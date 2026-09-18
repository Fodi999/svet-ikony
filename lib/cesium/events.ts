import * as C from '@cesium/engine';
import type {MapEvent, SelectedEventTarget} from '@/components/site/visualizer/Earth3DCanvas';
import {historicalPalette, type HistoricalTerritory} from '@/lib/visualizer/historical-territories';

function located<T extends {latitude: number | null; longitude: number | null}>(target: T | null): target is T & {latitude: number; longitude: number} {
  return target != null && target.latitude != null && target.longitude != null &&
    Number.isFinite(target.latitude) && Number.isFinite(target.longitude) &&
    Math.abs(target.latitude) <= 90 && Math.abs(target.longitude) <= 180;
}

/** The existing UI owns event/year filtering; this layer only renders its selection. */
export function createCesiumEvents(widget: C.CesiumWidget, onSelect: (id: string) => void, onError: (error: unknown) => void) {
  const source = new C.CustomDataSource('HistoryEvents');
  let disposed = false, generation = 0, visible = true, historical: C.GeoJsonDataSource | null = null;
  void widget.dataSources.add(source).then(() => {
    if (disposed && !widget.isDestroyed()) widget.dataSources.remove(source, true);
  }).catch(onError);
  const handler = new C.ScreenSpaceEventHandler(widget.canvas);
  handler.setInputAction((movement: {position: C.Cartesian2}) => {
    const id = widget.scene.pick(movement.position)?.id?.properties?.eventId?.getValue();
    if (typeof id === 'string') onSelect(id);
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  return {
    id: 'history-events', kind: 'event' as const,
    setVisible(value: boolean) {
      if (disposed) return;
      visible = value; source.show = value;
      if (historical) historical.show = value;
      widget.scene.requestRender();
    },
    update(events: MapEvent[], selected: SelectedEventTarget) {
      if (disposed) return;
      source.entities.removeAll();
      for (const event of events) {
        if (!located(event)) continue;
        source.entities.add({id: `event:${event.id}`, name: event.title,
          properties: {eventId: event.id}, position: C.Cartesian3.fromDegrees(event.longitude, event.latitude),
          point: {pixelSize: selected?.id === event.id ? 10 : 7, color: C.Color.fromCssColorString('#f4d793'),
            outlineColor: C.Color.BLACK, outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND}});
      }
      if (selected?.modelUrl && located(selected)) {
        source.entities.add({id: 'selected-event-model', properties: {eventId: selected.id},
          position: C.Cartesian3.fromDegrees(selected.longitude, selected.latitude),
          model: {uri: selected.modelUrl, heightReference: C.HeightReference.CLAMP_TO_GROUND, minimumPixelSize: 48}});
      }
      widget.scene.requestRender();
    },
    focus(selected: SelectedEventTarget) {
      if (disposed || !located(selected)) return;
      widget.camera.flyTo({destination: C.Cartesian3.fromDegrees(selected.longitude, selected.latitude, 150000)});
    },
    async territory(territory: HistoricalTerritory | null) {
      if (disposed) return;
      const current = ++generation;
      if (historical) { widget.dataSources.remove(historical, true); historical = null; }
      widget.scene.requestRender();
      if (!territory) return;
      const palette = historicalPalette(territory);
      const next = await C.GeoJsonDataSource.load({type: 'Feature', properties: {id: territory.id}, geometry: territory.geometry},
        {clampToGround: true, fill: C.Color.fromCssColorString(palette.fill).withAlpha(0.3), stroke: C.Color.fromCssColorString(palette.border), strokeWidth: 2});
      if (disposed || current !== generation) { next.entities.removeAll(); return; }
      next.show = visible;
      historical = next;
      await widget.dataSources.add(next);
      if (disposed || current !== generation) {
        if (!widget.isDestroyed()) widget.dataSources.remove(next, true);
        return;
      }
      widget.scene.requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; handler.destroy();
      if (historical) widget.dataSources.remove(historical, true);
      widget.dataSources.remove(source, true);
    }
  };
}
