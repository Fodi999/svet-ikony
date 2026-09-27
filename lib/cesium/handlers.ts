import {ScreenSpaceEventHandler,type CesiumWidget} from '@cesium/engine';
import * as C from '@cesium/engine';
/** A small screen-space hit target survives a country highlight above the pin. */
export function pickCalendarMarker(widget:CesiumWidget,position:C.Cartesian2){
  if(Array.isArray(widget.scene.pick(position)?.id))return undefined;
  const occluder=new C.Occluder(new C.BoundingSphere(C.Cartesian3.ZERO,widget.scene.globe.ellipsoid.minimumRadius),widget.camera.positionWC);
  let best:C.Entity|undefined,distance=Number.POSITIVE_INFINITY;
  for(let i=0;i<widget.dataSources.length;i++){
    const source=widget.dataSources.get(i);if(!source.show)continue;
    for(const entity of source.entities.values){
      if(!entity.show||!entity.billboard||!entity.properties?.calendarEntityId)continue;
      const world=entity.position?.getValue(widget.clock.currentTime);if(!world||!occluder.isPointVisible(world))continue;
      const screen=C.SceneTransforms.worldToWindowCoordinates(widget.scene,world);if(!screen)continue;
      const dx=position.x-screen.x,dy=position.y-(screen.y-36),d=dx*dx+dy*dy;
      if(Math.abs(dx)<=34&&Math.abs(dy)<=40&&d<distance){best=entity;distance=d;}
    }
  }return best;
}
const counts=new WeakMap<CesiumWidget,number>();
export function layerHandlerCount(widget:CesiumWidget){return counts.get(widget)??0;}
/** Layer-owned input handlers are counted independently of Cesium's camera controls. */
export function createLayerHandler(widget:CesiumWidget){
  const handler=new ScreenSpaceEventHandler(widget.canvas);let disposed=false;
  counts.set(widget,layerHandlerCount(widget)+1);
  return {handler,dispose(){if(disposed)return;disposed=true;handler.destroy();counts.set(widget,layerHandlerCount(widget)-1);}};
}
