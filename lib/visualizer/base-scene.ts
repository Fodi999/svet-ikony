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
