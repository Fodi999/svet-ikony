import {ScreenSpaceEventHandler,type CesiumWidget} from '@cesium/engine';
const counts=new WeakMap<CesiumWidget,number>();
export function layerHandlerCount(widget:CesiumWidget){return counts.get(widget)??0;}
/** Layer-owned input handlers are counted independently of Cesium's camera controls. */
export function createLayerHandler(widget:CesiumWidget){
  const handler=new ScreenSpaceEventHandler(widget.canvas);let disposed=false;
  counts.set(widget,layerHandlerCount(widget)+1);
  return {handler,dispose(){if(disposed)return;disposed=true;handler.destroy();counts.set(widget,layerHandlerCount(widget)-1);}};
}
