import type {CesiumWidget} from '@cesium/engine';

/** Drawing-buffer pixel budgets: in motion, and at rest (large Retina screens would otherwise exceed 7M pixels). */
export const MOVING_PIXELS=1_500_000,RESTING_PIXELS=4_500_000;
export function resolutionForMotion(dpr:number,width:number,height:number,moving:boolean) {
  const native=Math.max(1,dpr||1),maximum=Math.min(native,2);
  const effective=Math.min(maximum,Math.max(1,Math.sqrt((moving?MOVING_PIXELS:RESTING_PIXELS)/Math.max(1,width*height))));
  return effective/native;
}

export function installRenderQuality(widget:CesiumWidget) {
  let moving=false,disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
  const restingView=Array.from({length:16},(_,i)=>widget.camera.viewMatrix[i]);
  widget.useBrowserRecommendedResolution=false;
  const apply=()=>{
    if(disposed||widget.isDestroyed())return;
    const next=resolutionForMotion(window.devicePixelRatio,widget.canvas.clientWidth,widget.canvas.clientHeight,moving);
    if(widget.resolutionScale===next)return;
    widget.resolutionScale=next;widget.resize();widget.scene.requestRender();
  };
  const start=widget.camera.moveStart.addEventListener(()=>{
    // Resizing the drawing buffer changes the frustum too, but is not camera motion.
    if(!moving&&restingView.every((value,i)=>value===widget.camera.viewMatrix[i]))return;
    clearTimeout(timer);moving=true;apply();
  });
  // Avoid resolution churn between successive wheel/inertia movements.
  const end=widget.camera.moveEnd.addEventListener(()=>{
    if(!moving)return;
    clearTimeout(timer);timer=setTimeout(()=>{
      for(let i=0;i<16;i++)restingView[i]=widget.camera.viewMatrix[i];
      moving=false;apply();
    },200);
  });
  window.addEventListener('resize',apply);apply();
  return ()=>{disposed=true;clearTimeout(timer);start();end();window.removeEventListener('resize',apply);};
}
