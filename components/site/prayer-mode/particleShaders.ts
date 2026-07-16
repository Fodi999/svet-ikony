export const particleVertexShader = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec3 aColor;
attribute float aRandom;

uniform float uTime;
uniform float uProgress;
uniform float uDissolve;
uniform float uAudioLevel;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uOrbit;

varying vec3 vColor;
varying float vAudioLevel;

void main() {
  vec3 drift = vec3(
    sin(uTime * 0.15 + aRandom * 6.2831) * 0.05,
    cos(uTime * 0.12 + aRandom * 6.2831) * 0.05,
    0.0
  );

  float eased = uProgress * uProgress * (3.0 - 2.0 * uProgress);
  vec3 assembled = mix(aStart + drift, aTarget, eased);

  vec3 dissolveDir = normalize(aStart - aTarget + vec3(0.0001));
  vec3 dissolved = assembled + dissolveDir * uDissolve * (1.6 + aRandom * 2.2);
  vec3 finalPos = mix(assembled, dissolved, uDissolve);

  finalPos += vec3(
    sin(uTime * 0.34 + aRandom * 24.0) * 0.34,
    cos(uTime * 0.27 + aRandom * 18.0) * 0.22,
    sin(uTime * 0.22 + aRandom * 12.0) * 0.08
  ) * uOrbit;

  finalPos += vec3(
    sin(uTime * 2.0 + aRandom * 40.0),
    cos(uTime * 2.3 + aRandom * 40.0),
    0.0
  ) * uAudioLevel * 0.02 * eased;

  vColor = aColor;
  vAudioLevel = uAudioLevel;

  vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
  gl_PointSize = uPointSize * uPixelRatio * (0.55 + 0.45 * eased) * (1.0 + uAudioLevel * 0.6) * mix(1.0, 0.72, uOrbit);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const particleFragmentShader = /* glsl */ `
precision mediump float;

uniform float uOpacity;
varying vec3 vColor;
varying float vAudioLevel;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float dist = length(centered);
  if (dist > 0.5) discard;

  // A mostly-solid core with only a thin antialiased edge reads as a crisp
  // dot; the old full-gaussian falloff (0.5 -> 0.0) made every point a soft
  // haze that, once many overlapped under additive blending, muddied the
  // whole silhouette into fog instead of a sharp image.
  float alpha = smoothstep(0.5, 0.32, dist) * uOpacity * (0.78 + vAudioLevel * 0.35);
  gl_FragColor = vec4(vColor, alpha);
}
`;
