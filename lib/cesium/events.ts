import * as C from '@cesium/engine';
import {createLayerHandler} from './handlers';
import type {MapEvent, SelectedEventTarget} from '@/components/site/visualizer/Earth3DCanvas';
import {historicalPalette, type HistoricalTerritory} from '@/lib/visualizer/historical-territories';
import {createSelectionHexController,selectionHex} from './selection-hex';

function located<T extends {latitude: number | null; longitude: number | null}>(target: T | null): target is T & {latitude: number; longitude: number} {
  return target != null && target.latitude != null && target.longitude != null &&
    Number.isFinite(target.latitude) && Number.isFinite(target.longitude) &&
    Math.abs(target.latitude) <= 90 && Math.abs(target.longitude) <= 180;
}

/** The existing UI owns event/year filtering; this layer only renders its selection. */
export function createCesiumEvents(widget: C.CesiumWidget, onSelect: (id: string) => void, onError: (error: unknown) => void) {
  const source = new C.CustomDataSource('HistoryEvents');
  const selectionHexes=createSelectionHexController(widget,source);
  let disposed = false, generation = 0, territoriesVisible = true, independentTerritories = false, historical: C.GeoJsonDataSource | null = null;
  void widget.dataSources.add(source).then(() => {
    if (disposed && !widget.isDestroyed()) widget.dataSources.remove(source, true);
  }).catch(onError);
  const input=createLayerHandler(widget),handler=input.handler;
  handler.setInputAction((movement: {position: C.Cartesian2}) => {
    const id = widget.scene.pick(movement.position)?.id?.properties?.eventId?.getValue();
    if (typeof id === 'string') onSelect(id);
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  return {
    id: 'history-events', kind: 'event' as const,
    setVisible(value: boolean) {
      if (disposed) return;
      source.show = value;
      if(!independentTerritories){territoriesVisible=value;if(historical)historical.show=value;}
      widget.scene.requestRender();
    },
    setTerritoriesVisible(value:boolean){independentTerritories=true;territoriesVisible=value;if(historical)historical.show=value;widget.scene.requestRender();},
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
      if(located(selected))source.entities.add({id:'event-selection-hex',...selectionHex(selected.longitude,selected.latitude,{eventId:selected.id})});
      selectionHexes.refresh();
      widget.scene.requestRender();
    },
    focus(selected: SelectedEventTarget) {
      if (disposed || !located(selected)) return;
      widget.camera.flyTo({destination: C.Cartesian3.fromDegrees(selected.longitude, selected.latitude, 150000)});
    },
    mosaic(selected:SelectedEventTarget,label:string,focus=false){
      if(disposed)return;
      source.entities.removeById('history-mosaic');
      if(!located(selected)){widget.scene.requestRender();return;}
      source.entities.removeById('event-selection-hex');
      const marker=source.entities.getById(`event:${selected.id}`);if(marker)marker.show=false;
      source.entities.add({id:'history-mosaic',...selectionHex(selected.longitude,selected.latitude,{eventId:selected.id}),
        label:{text:label,font:'24px sans-serif',scale:.65,style:C.LabelStyle.FILL_AND_OUTLINE,fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:2,
          heightReference:C.HeightReference.CLAMP_TO_GROUND,pixelOffset:new C.Cartesian2(0,-24),distanceDisplayCondition:new C.DistanceDisplayCondition(0,40000)},
      });
      selectionHexes.refresh();
      if(focus){widget.camera.cancelFlight();widget.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(selected.longitude,selected.latitude),700),{
        offset:new C.HeadingPitchRange(0,-Math.PI/3,7000),duration:1.4,
      });}
      widget.scene.requestRender();
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
      next.show = territoriesVisible;
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
      disposed = true; generation++; selectionHexes.dispose();input.dispose();
      if(widget.isDestroyed())return;
      if (historical) widget.dataSources.remove(historical, true);
      widget.dataSources.remove(source, true);
    }
  };
}
