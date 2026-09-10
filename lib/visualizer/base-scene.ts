import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type SceneCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/** Keep sky domes and companion bodies out of Earth's scale calculation. */
export function prepareBaseScene(gltf: GLTF) {
  const earth = gltf.scene.getObjectByName('Earth') ?? gltf.scene;
  const bounds = new THREE.Box3().setFromObject(earth);
  const size = bounds.getSize(new THREE.Vector3());
  const diameter = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Empty Earth model');
  let yaw = 0;
  // Exported geographic anchors describe the model's longitude convention.
  // Align it with the viewer's +Z Greenwich / +X east before focusing events.
  const anchor = earth.children.find((node) => typeof node.userData.longitude === 'number');
  if (anchor) {
    const point = anchor.getWorldPosition(new THREE.Vector3()).sub(bounds.getCenter(new THREE.Vector3()));
    yaw = THREE.MathUtils.degToRad(anchor.userData.longitude) - Math.atan2(point.x, point.z);
  }
  else if (typeof earth.userData.gltf_axes === 'string'
    && earth.userData.gltf_axes.replace(/\s+/g, '').toLowerCase() === 'north+y;greenwich+x;longitude+90-z') {
    // Standalone HQ/optimized exports omit the old marker nodes but explicitly
    // declare their geographic frame in glTF extras. Rotate that entire frame
    // into the viewer convention; do not guess from the filename or material.
    const greenwich = new THREE.Vector3(1, 0, 0).transformDirection(earth.matrixWorld);
    yaw = -Math.atan2(greenwich.x, greenwich.z);
  }
  const model = new THREE.Group();
  const offset = new THREE.Group();
  offset.position.copy(bounds.getCenter(new THREE.Vector3())).negate();
  offset.add(gltf.scene);
  model.add(offset);
  model.scale.setScalar(3.6 / diameter);
  model.rotation.y = yaw;
  model.updateMatrixWorld(true);
  const source = gltf.cameras?.[0] as SceneCamera | undefined;
  let camera: SceneCamera | null = null;
  if (source && (source.type === 'PerspectiveCamera' || source.type === 'OrthographicCamera')) {
    camera = source.clone();
    source.getWorldPosition(camera.position);
    source.getWorldQuaternion(camera.quaternion);
    camera.scale.set(1, 1, 1);
    camera.near = Math.max(0.001, source.near * model.scale.x);
    camera.far = source.far * model.scale.x;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left *= model.scale.x; camera.right *= model.scale.x;
      camera.top *= model.scale.x; camera.bottom *= model.scale.x;
    }
    camera.updateProjectionMatrix();
  }
  return { model, camera };
}

export function resizeSceneCamera(camera: SceneCamera, aspect: number) {
  if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
  else {
    const halfHeight = (camera.top - camera.bottom) / 2;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
  }
  camera.updateProjectionMatrix();
}

/** Runtime staging only: no vertex/material/GLB changes. Framing is measured
 * against the central viewport, independently of surrounding panel widths. */
export function composeEarthOverview(model: THREE.Group, camera: SceneCamera) {
  const earth = model.getObjectByName('Earth');
  if (!earth) return () => {}; // Generic uploaded models keep their own framing.
  const earthRadius = 1.8;
  camera.position.setFromSphericalCoords(16, THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(22));
  camera.lookAt(0, 0, 0);
  camera.zoom = 1;
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const sun = model.getObjectByName('Sun');
  const corona = model.getObjectByName('Sun_Corona');
  const moon = model.getObjectByName('Moon');
  let sunGroup: THREE.Group | null = null;
  let sunRadius = 1;
  if (sun) {
    model.updateMatrixWorld(true);
    const center = sun.getWorldPosition(new THREE.Vector3());
    const size = new THREE.Box3().setFromObject(sun).getSize(new THREE.Vector3());
    sunRadius = Math.max(size.x, size.y, size.z) / 2;
    sunGroup = new THREE.Group(); sunGroup.name = 'OverviewSun';
    sunGroup.position.copy(model.worldToLocal(center));
    model.add(sunGroup); sunGroup.updateMatrixWorld(true);
    sunGroup.attach(sun);
    if (corona) sunGroup.attach(corona);
  }
  if (moon) {
    const size = new THREE.Box3().setFromObject(moon).getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) / 2;
    if (radius > 0) moon.scale.multiplyScalar(0.34 / radius);
  }
  return (aspect: number) => {
    // 48% of scene height on desktop, with breathing room on narrow canvases.
    const halfHeight = earthRadius / Math.min(0.48, aspect * 0.68);
    const halfWidth = halfHeight * aspect;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.left = -halfWidth; camera.right = halfWidth;
    } else {
      camera.fov = 35; camera.aspect = aspect;
      camera.position.setLength(halfHeight / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    if (sunGroup && sunRadius > 0) {
      const radius = Math.min(halfHeight * 0.7, halfWidth * 0.6);
      sunGroup.scale.setScalar(radius / sunRadius);
      // Only a crescent-like edge of the disk enters the leftmost 14%.
      const center = right.clone().multiplyScalar(-halfWidth - radius + halfWidth * 0.28).addScaledVector(up, halfHeight * 0.25);
      sunGroup.position.copy(model.worldToLocal(center));
    }
    if (moon?.parent) {
      const center = right.clone().multiplyScalar(Math.min(earthRadius * 1.7, halfWidth * 0.70)).addScaledVector(up, earthRadius * 1.45);
      moon.parent.updateWorldMatrix(true, false);
      moon.position.copy(moon.parent.worldToLocal(center));
    }
    model.updateMatrixWorld(true);
  };
}
