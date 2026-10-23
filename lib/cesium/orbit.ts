import * as C from '@cesium/engine';

/** One full circle takes this long. */
export const ORBIT_PERIOD_MS=90_000;
/** Heading after `elapsed` ms of orbit starting from `start` (radians, wrapped to [0, 2π)). */
export function orbitHeading(start:number,elapsed:number){
  const value=(start+elapsed/ORBIT_PERIOD_MS*Math.PI*2)%(Math.PI*2);
  return value<0?value+Math.PI*2:value;
}

/**
 * "Fly around" a sacred place, as in Google Earth: the camera approaches the
 * place at an oblique angle, then slowly circles it until the visitor touches
 * the map. The camera is only ever locked to the place while circling and is
 * released on any interaction or stop().
 */
export function createOrbit(widget:C.CesiumWidget){
  let frame=0,run=0;
  const canvas=widget.canvas;
  const stop=()=>{
    run++;
    if(frame)cancelAnimationFrame(frame);frame=0;
    for(const type of ['pointerdown','wheel','touchstart'])canvas.removeEventListener(type,stop);
    window.removeEventListener('keydown',stop);
    if(!widget.isDestroyed()&&!widget.camera.transform.equals(C.Matrix4.IDENTITY))widget.camera.lookAtTransform(C.Matrix4.IDENTITY);
  };
  /** The place on the loaded terrain (models and the 3D relief stand on it), else on the ellipsoid. */
  const ground=(lat:number,lon:number)=>{
    const height=widget.scene.globe.getHeight(C.Cartographic.fromDegrees(lon,lat));
    return C.Cartesian3.fromDegrees(lon,lat,height??0);
  };
  const start=(place:{lat:number;lon:number},options:{range?:number;pitch?:number}={})=>{
    stop();
    const current=++run,range=options.range??1400,pitch=C.Math.toRadians(options.pitch??-32);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    widget.camera.cancelFlight();
    widget.camera.flyToBoundingSphere(new C.BoundingSphere(ground(place.lat,place.lon),0),{
      offset:new C.HeadingPitchRange(widget.camera.heading,pitch,range),duration:reduced?0:2.2,
      complete:()=>{
        if(current!==run||reduced||widget.isDestroyed())return;
        const target=ground(place.lat,place.lon),heading=widget.camera.heading,began=performance.now();
        for(const type of ['pointerdown','wheel','touchstart'])canvas.addEventListener(type,stop,{passive:true});
        window.addEventListener('keydown',stop);
        const step=(now:number)=>{
          if(current!==run||widget.isDestroyed())return;
          widget.camera.lookAt(target,new C.HeadingPitchRange(orbitHeading(heading,now-began),pitch,range));
          widget.scene.requestRender();
          frame=requestAnimationFrame(step);
        };
        frame=requestAnimationFrame(step);
      },
    });
  };
  return {start,stop,dispose:stop};
}
