import * as THREE from 'three';
import outlines from './land-outlines.json';

import { latLngToVector3 } from './geography';
export function globePoint(latitude: number, longitude: number, radius = 1.8) {
  return latLngToVector3(latitude, longitude, radius);
}

/** Self-contained globe: no model upload, textures, or external requests needed. */
export function createDefaultEarth() {
  const earth = new THREE.Group();
  earth.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 64, 48),
    new THREE.MeshStandardMaterial({ color: 0x192b2a, roughness: 0.85, metalness: 0.15 })
  ));
  function line(points: THREE.Vector3[], color: number, opacity: number) {
    earth.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    ));
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    line(Array.from({ length: 181 }, (_, i) => globePoint(latitude, i * 2, 1.804)), 0xcda45a, 0.2);
  }
  for (let longitude = 0; longitude < 360; longitude += 30) {
    line(Array.from({ length: 91 }, (_, i) => globePoint(i * 2 - 90, longitude, 1.804)), 0xcda45a, 0.2);
  }
  for (const ring of outlines) {
    line(ring.map(([longitude, latitude]) => globePoint(latitude, longitude, 1.81)), 0xe4c987, 0.85);
  }
  return earth;
}
