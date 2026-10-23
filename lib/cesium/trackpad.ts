import type {CesiumWidget} from '@cesium/engine';

/**
 * macOS trackpad pinch arrives as `wheel` with ctrlKey=true (Chrome, Edge,
 * Firefox) and as GestureEvents in Safari. Cesium's default camera controls
 * only zoom on an unmodified wheel, so a pinch did nothing. This zooms by a
 * fraction of the current height, smooth for small pinch deltas and still
 * sane for a fast pinch. Two-finger scroll (no ctrl) stays Cesium's own zoom.
 */
export function zoomStep(height:number,delta:number){
  const factor=Math.min(.45,Math.abs(delta)*.012);
  return Math.max(2,height*factor);
}
export function installTrackpadZoom(widget:CesiumWidget){
  const canvas=widget.canvas;
  const zoom=(delta:number)=>{
    if(widget.isDestroyed()||!widget.scene.screenSpaceCameraController.enableZoom)return;
    const step=zoomStep(widget.camera.positionCartographic.height,delta);
    if(delta<0)widget.camera.zoomIn(step);else widget.camera.zoomOut(step);
    widget.scene.requestRender();
  };
  const wheel=(event:WheelEvent)=>{
    if(!event.ctrlKey)return;
    event.preventDefault();event.stopImmediatePropagation();
    zoom(event.deltaY);
  };
  let lastScale=1;
  type Gesture=Event&{scale:number};
  const start=(event:Event)=>{event.preventDefault();lastScale=(event as Gesture).scale||1;};
  const change=(event:Event)=>{
    event.preventDefault();
    const scale=(event as Gesture).scale||1,ratio=scale/lastScale;lastScale=scale;
    if(Math.abs(ratio-1)>.001)zoom(ratio>1?-(ratio-1)*120:(1/ratio-1)*120);
  };
  canvas.addEventListener('wheel',wheel,{passive:false,capture:true});
  canvas.addEventListener('gesturestart',start,{passive:false});
  canvas.addEventListener('gesturechange',change,{passive:false});
  return ()=>{canvas.removeEventListener('wheel',wheel,{capture:true});canvas.removeEventListener('gesturestart',start);canvas.removeEventListener('gesturechange',change);};
}
