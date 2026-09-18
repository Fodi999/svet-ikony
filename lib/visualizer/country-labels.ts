import * as THREE from 'three';
import type { CountryIndex } from './countries';
import type { SceneCamera } from './base-scene';
import { latLngToVector3 } from './geography';

type Context = {
  index: CountryIndex; container: HTMLElement; canvas: HTMLCanvasElement;
  frame: THREE.Group; borders: THREE.LineSegments;
  camera: () => SceneCamera; locale: () => 'uk' | 'ru' | 'en'; available: () => boolean;
};

/** Screen-space labels anchored to the same calibrated geography as country outlines. */
export function createCountryLabels(ctx: Context) {
  const root = document.createElement('div');
  root.dataset.countryLabels = '';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  ctx.container.appendChild(root);
  const entries = [...ctx.index.countries].sort((a,b) => b.angularExtent-a.angularExtent).map(country => {
    const label = document.createElement('span');
    label.dataset.countryCode = country.info.code;
    label.style.cssText = 'position:absolute;display:none;color:#fff;font:600 18px/24px Arial,sans-serif;letter-spacing:0;white-space:nowrap;transform:translate(-50%,-50%);text-shadow:-1px -1px 1px #171b20,1px -1px 1px #171b20,-1px 1px 1px #171b20,1px 1px 1px #171b20,0 1px 3px #000;';
    root.appendChild(label);
    return {country,label,width:0};
  });
  const center = new THREE.Vector3(), point = new THREE.Vector3(), normal = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3(), direction = new THREE.Vector3(), projected = new THREE.Vector3();
  const scale = new THREE.Vector3();
  function tick() {
    root.hidden = !ctx.available();
    if (root.hidden) return;
    const camera = ctx.camera(), viewport = ctx.canvas.getBoundingClientRect();
    ctx.frame.updateWorldMatrix(true,false); camera.updateWorldMatrix(true,false);
    center.copy(ctx.borders.position).applyMatrix4(ctx.frame.matrixWorld);
    ctx.frame.getWorldScale(scale);
    const radius = Number(ctx.borders.userData.earthRadius) * Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));
    camera.getWorldPosition(cameraPosition);
    const distance = cameraPosition.distanceTo(center);
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    const pixelsPerUnit = ortho
      ? viewport.height * (camera as THREE.OrthographicCamera).zoom / ((camera as THREE.OrthographicCamera).top-(camera as THREE.OrthographicCamera).bottom)
      : viewport.height / (2*Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)/2)*Math.max(distance-radius,radius*.001));
    const occupied: {left:number;top:number;right:number;bottom:number}[] = [];
    const budget = Math.max(3,Math.min(16,Math.floor(viewport.width*viewport.height/65000)));
    for (const entry of entries) {
      const {country,label} = entry;
      label.style.display = 'none';
      if (!Number.isFinite(radius) || radius <= 0 || !viewport.height || distance < radius*1.032 || occupied.length>=budget) continue;
      const name = country.info.name[ctx.locale()];
      if (label.textContent !== name) { label.textContent = name; entry.width=0; }
      const extent = THREE.MathUtils.degToRad(country.angularExtent)*radius*pixelsPerUnit;
      if (extent < 100) continue;
      point.copy(latLngToVector3(country.point.latitude,country.point.longitude,Number(ctx.borders.userData.earthRadius)*1.001));
      point.add(ctx.borders.position).applyMatrix4(ctx.frame.matrixWorld);
      normal.copy(point).sub(center).normalize();
      if (ortho) camera.getWorldDirection(direction).negate(); else direction.copy(cameraPosition).sub(point).normalize();
      if (normal.dot(direction) < .12) continue;
      projected.copy(point).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const x=(projected.x+1)*viewport.width/2, y=(1-projected.y)*viewport.height/2;
      label.style.display='block';
      const width=entry.width || (entry.width=label.offsetWidth || name.length*10), height=24;
      const box={left:x-width/2-24,top:y-height/2-18,right:x+width/2+24,bottom:y+height/2+18};
      if (box.left<0 || box.top<0 || box.right>viewport.width || box.bottom>viewport.height || occupied.some(b=>box.left<b.right && box.right>b.left && box.top<b.bottom && box.bottom>b.top)) {
        label.style.display='none'; continue;
      }
      occupied.push(box);
      label.style.left=`${x}px`; label.style.top=`${y}px`;
    }
  }
  return {tick,dispose:()=>root.remove()};
}
