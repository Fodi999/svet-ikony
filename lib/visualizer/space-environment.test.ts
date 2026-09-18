import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSpaceEnvironment } from './space-environment';

describe('space environment', () => {
  it('uses deterministic finite stars behind opaque geometry', () => {
    const first = createSpaceEnvironment(), second = createSpaceEnvironment();
    const stars = first.group.getObjectByName('Starfield') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const other = second.group.getObjectByName('Starfield') as THREE.Points;
    expect(stars.geometry.getAttribute('position').count).toBe(5500);
    expect([...stars.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    expect(stars.geometry.getAttribute('position').array).toEqual(other.geometry.getAttribute('position').array);
    expect(stars.material.depthTest).toBe(true);
    expect(stars.material.depthWrite).toBe(false);
  });
  it('fades stars near terrain without moving the sun with the camera', () => {
    const space = createSpaceEnvironment(), camera = new THREE.PerspectiveCamera();
    const stars = space.group.getObjectByName('Starfield') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const sun = space.group.children.find(node => node instanceof THREE.DirectionalLight)!;
    const position = sun.position.clone();
    camera.position.set(0, 0, 6); space.update(camera, 2);
    expect(stars.visible).toBe(true);
    expect(stars.material.uniforms.opacity.value).toBe(1);
    camera.position.set(0, 0, 1.81); space.update(camera, 1);
    expect(stars.visible).toBe(false);
    expect(sun.position).toEqual(position);
    camera.position.set(0, 0, 6); space.update(camera, 1, false);
    expect(stars.visible).toBe(false);
  });
});
