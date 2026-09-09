import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { prepareBaseScene, resizeSceneCamera, composeEarthOverview } from './base-scene';

function asset() {
  const scene = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
  earth.name = 'Earth';
  const anchor = new THREE.Object3D();
  anchor.userData.longitude = 0;
  anchor.position.set(1, 0, 0); // Blender-exported Greenwich faces +X.
  earth.add(anchor);
  const stars = new THREE.Mesh(new THREE.SphereGeometry(90), new THREE.MeshBasicMaterial());
  const camera = new THREE.OrthographicCamera(-4, 4, 2.25, -2.25, 0.01, 300);
  camera.position.set(10, 8, -8);
  camera.lookAt(0, 0, 0);
  scene.add(earth, stars, camera);
  return { scene, cameras: [camera], animations: [] } as unknown as GLTF;
}

describe('authored Earth scene', () => {
  it('scales the Earth, retains the surrounding sky and uses the embedded camera', () => {
    const gltf = asset();
    const { model, camera } = prepareBaseScene(gltf);
    expect(model.scale.x).toBeCloseTo(1.8);
    expect(camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(camera!.position.length()).toBeCloseTo(Math.sqrt(228) * 1.8);
    expect((camera as THREE.OrthographicCamera).top).toBeCloseTo(4.05);
    expect(camera!.far).toBeCloseTo(540);
    const earth = gltf.scene.getObjectByName('Earth')!;
    const anchor = earth.children[0].getWorldPosition(new THREE.Vector3());
    expect(anchor.x).toBeCloseTo(0);
    expect(anchor.z).toBeCloseTo(1.8);
    const forward = camera!.getWorldDirection(new THREE.Vector3());
    expect(forward.dot(camera!.position.clone().normalize())).toBeCloseTo(-1);
  });
  it('preserves vertical composition when the viewport changes aspect ratio', () => {
    const { camera } = prepareBaseScene(asset());
    resizeSceneCamera(camera!, 0.75);
    const ortho = camera as THREE.OrthographicCamera;
    expect(ortho.top).toBeCloseTo(4.05);
    expect(ortho.right - ortho.left).toBeCloseTo((ortho.top - ortho.bottom) * 0.75);
  });
});


describe('Earth-first overview composition', () => {
  it.each([1, 1.4, 2])('frames Earth at 48%% height and limits the Sun at aspect %s', (aspect) => {
    const gltf = asset();
    const sun = new THREE.Mesh(new THREE.SphereGeometry(4.5), new THREE.MeshBasicMaterial()); sun.name = 'Sun'; sun.position.set(6, 3, 4);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.27), new THREE.MeshBasicMaterial()); moon.name = 'Moon'; moon.position.set(-1.4, 1.2, -1.3);
    gltf.scene.add(sun, moon);
    const vertices = Array.from(sun.geometry.attributes.position.array);
    const { model, camera } = prepareBaseScene(gltf);
    composeEarthOverview(model, camera!)(aspect);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera!.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera!.quaternion);
    const top = up.clone().multiplyScalar(1.8).project(camera!);
    const bottom = up.clone().multiplyScalar(-1.8).project(camera!);
    expect((top.y - bottom.y) / 2).toBeCloseTo(0.48);
    const center = new THREE.Vector3().project(camera!);
    expect(center.x).toBeCloseTo(0); expect(center.y).toBeCloseTo(0);
    const radius = 4.5 * model.scale.x * model.getObjectByName('OverviewSun')!.scale.x;
    const sunRight = sun.getWorldPosition(new THREE.Vector3()).addScaledVector(right, radius).project(camera!);
    expect((sunRight.x + 1) / 2).toBeCloseTo(0.14);
    const moonPoint = moon.getWorldPosition(new THREE.Vector3());
    expect(moonPoint.length()).toBeGreaterThan(1.8 + 0.34 + 0.5);
    moonPoint.project(camera!);
    expect(moonPoint.x).toBeGreaterThan(0); expect(moonPoint.x).toBeLessThan(1);
    expect(moonPoint.y).toBeGreaterThan(0); expect(moonPoint.y).toBeLessThan(1);
    expect(Array.from(sun.geometry.attributes.position.array)).toEqual(vertices);
  });
});
