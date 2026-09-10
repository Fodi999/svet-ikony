import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneCamera } from './base-scene';
import type { Country, LatLng } from './countries';
import { latLngToVector3 } from './geography';

export function screenPointToEarthLatLng(clientX:number,clientY:number,rect:Pick<DOMRect,'left'|'top'|'width'|'height'>,camera:SceneCamera,surface:THREE.Object3D,geographicFrame:THREE.Object3D,center:THREE.Vector3,raycaster:THREE.Raycaster): LatLng | null {
  if(!rect.width || !rect.height)return null;
  camera.updateMatrixWorld();surface.updateWorldMatrix(true,false);geographicFrame.updateWorldMatrix(true,false);
  raycaster.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),camera);
  const hit=raycaster.intersectObject(surface,false)[0];if(!hit)return null;
  const local=geographicFrame.worldToLocal(hit.point.clone()).sub(center).normalize();
  return {latitude:THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(local.y,-1,1))),longitude:THREE.MathUtils.radToDeg(Math.atan2(local.x,local.z))};
}
export function countryCameraTarget(country:Country,camera:SceneCamera,frame:THREE.Object3D,center:THREE.Vector3,radius:number,controls:OrbitControls){
  frame.updateWorldMatrix(true,false);
  const worldCenter=frame.localToWorld(center.clone());
  const direction=latLngToVector3(country.point.latitude,country.point.longitude,1).transformDirection(frame.matrixWorld);
  const extent=THREE.MathUtils.degToRad(Math.min(150,Math.max(8,country.angularExtent)));
  let distance:number,zoom=camera.zoom;
  if(camera instanceof THREE.PerspectiveCamera){
    const verticalFov=THREE.MathUtils.degToRad(camera.fov)/2;
    const fov=Math.min(verticalFov,Math.atan(Math.tan(verticalFov)*camera.aspect));
    const visibleRadius=radius*Math.sin(extent/2);
    distance=radius+visibleRadius/(Math.tan(fov)*0.65);
    distance=THREE.MathUtils.clamp(distance,controls.minDistance,controls.maxDistance);
  }else{
    distance=camera.position.distanceTo(worldCenter);
    zoom=THREE.MathUtils.clamp(Math.min(camera.top-camera.bottom,camera.right-camera.left)/(2*radius*Math.sin(extent/2)*1.5),controls.minZoom,controls.maxZoom);
  }
  return {position:worldCenter.clone().addScaledVector(direction,distance),center:worldCenter,zoom};
}
/** Shortest spherical arc; user pointer input can cancel without a camera jump. */
export function animateCountryCamera(camera:SceneCamera,controls:OrbitControls,target:{position:THREE.Vector3;center:THREE.Vector3;zoom:number},duration:number,onDone:()=>void=()=>{}){
  const start=camera.position.clone().sub(controls.target),end=target.position.clone().sub(target.center);
  const startTarget=controls.target.clone(),startZoom=camera.zoom;
  const rotation=new THREE.Quaternion().setFromUnitVectors(start.clone().normalize(),end.clone().normalize());
  const identity=new THREE.Quaternion(); const began=performance.now();let raf=0,cancelled=false;
  const wasEnabled=controls.enabled;controls.enabled=false;
  function tick(now:number){
    if(cancelled)return;
    const t=duration?Math.min(1,(now-began)/duration):1,e=t<0.5?4*t*t*t:1-(-2*t+2)**3/2;
    const center=startTarget.clone().lerp(target.center,e);
    const direction=start.clone().normalize().applyQuaternion(identity.clone().slerp(rotation,e));
    camera.position.copy(center).addScaledVector(direction,THREE.MathUtils.lerp(start.length(),end.length(),e));
    controls.target.copy(center);camera.zoom=THREE.MathUtils.lerp(startZoom,target.zoom,e);camera.lookAt(center);camera.updateProjectionMatrix();
    if(t<1)raf=requestAnimationFrame(tick);else{controls.enabled=wasEnabled;controls.update();onDone();}
  }
  raf=requestAnimationFrame(tick);
  return ()=>{cancelled=true;cancelAnimationFrame(raf);controls.enabled=wasEnabled;};
}
