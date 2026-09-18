import * as THREE from 'three';

export function createSpaceEnvironment() {
  const group = new THREE.Group();
  group.name = 'SpaceEnvironment';
  const ambient = new THREE.AmbientLight(0xb9d3ff, 0.18);
  const sun = new THREE.DirectionalLight(0xfff5e5, 2.6);
  sun.position.set(-6, 5, 8);
  group.add(ambient, sun);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, sunDirection: { value: sun.position.clone().normalize() } },
    vertexShader: `varying vec3 worldPoint; varying vec3 worldNormal;
      void main() {
        worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
        worldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPoint, 1.0);
      }`,
    fragmentShader: `varying vec3 worldPoint; varying vec3 worldNormal;
      uniform vec3 sunDirection; uniform float opacity;
      void main() {
        vec3 n = normalize(worldNormal);
        float rim = pow(1.0 - max(dot(n, normalize(cameraPosition - worldPoint)), 0.0), 3.0);
        float day = smoothstep(-0.2, 0.5, dot(n, sunDirection));
        gl_FragColor = vec4(0.22, 0.52, 0.95, (0.045 + rim * 0.64) * day * opacity);
      }`,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.815, 96, 64), atmosphereMaterial);
  atmosphere.name = 'AtmosphericLimb'; atmosphere.renderOrder = 2;
  group.add(atmosphere);

  let seed = 731;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const positions = [], sizes = [], brightness = [];
  for (let i = 0; i < 5500; i++) {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    positions.push(40 * r * Math.cos(angle), 40 * y, 40 * r * Math.sin(angle));
    sizes.push(0.8 + Math.pow(random(), 5) * 2.2);
    brightness.push(0.18 + Math.pow(random(), 3) * 0.7);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('starSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new THREE.Float32BufferAttribute(brightness, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float starSize; attribute float brightness;
      uniform float pixelRatio; varying float intensity;
      void main() {
        intensity = brightness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        gl_PointSize = starSize * pixelRatio;
      }`,
    fragmentShader: `uniform float opacity; varying float intensity;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = (1.0 - smoothstep(0.1, 0.5, d)) * intensity * opacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(0.85, 0.91, 1.0, alpha);
      }`,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Starfield'; stars.frustumCulled = false; stars.renderOrder = -100;
  group.add(stars);
  return { group, update(camera: THREE.Camera, pixelRatio: number, visible = true) {
    stars.position.copy(camera.position);
    material.uniforms.pixelRatio.value = pixelRatio;
    const fade = THREE.MathUtils.smoothstep(camera.position.length(), 2.05, 3.6);
    material.uniforms.opacity.value = fade;
    stars.visible = visible && fade > 0;
    atmosphere.visible = visible && fade > 0;
    atmosphereMaterial.uniforms.opacity.value = fade;
    ambient.intensity = THREE.MathUtils.lerp(0.65, 0.18, fade);
  } };
}
