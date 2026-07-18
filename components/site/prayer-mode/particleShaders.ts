export const particleVertexShader = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec3 aColor;
attribute float aRandom;
attribute float aAlpha;
attribute float aSize;
attribute float aReveal;
attribute float aShape;
attribute float aAspect;
attribute float aRotation;
attribute float aSoftness;
attribute float aGlow;

uniform float uTime;
uniform float uProgress;
uniform float uDissolve;
uniform float uAudioLevel;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uOrbit;

varying vec3 vColor;
varying float vAudioLevel;
varying float vAlpha;
varying float vShape;
varying float vAspect;
varying float vRotation;
varying float vSoftness;
varying float vGlow;

void main() {
  vec3 drift = vec3(
    sin(uTime * 0.15 + aRandom * 6.2831) * 0.05,
    cos(uTime * 0.12 + aRandom * 6.2831) * 0.05,
    0.0
  );

  // Stagger per-particle assembly using the backend-baked reveal order:
  // aReveal=0 (silhouette/contours) finishes assembling early, aReveal=1
  // (highlights) finishes last — producing the silhouette -> face -> detail
  // -> color -> highlights progressive reveal without any client-side image
  // classification. This is pure animation timing over backend-supplied
  // data, computed the same way for every particle.
  float staggerWidth = 0.42;
  float localProgress = clamp((uProgress - aReveal * (1.0 - staggerWidth)) / staggerWidth, 0.0, 1.0);
  float eased = localProgress * localProgress * (3.0 - 2.0 * localProgress);
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

  // "Living matter" breathing: a slow, per-particle-phase-offset pulse on
  // size and brightness (see breatheSize below and vAlpha in the fragment
  // shader) so the assembled image reads as alive rather than a frozen
  // photo made of dots. Position movement is kept deliberately tiny and is
  // damped further by aAlpha — high-alpha particles are concentrated on the
  // face/contours (baked from importance server-side), so the face itself
  // stays almost perfectly still while low-alpha background dust drifts a
  // hair more.
  float breathePhase = uTime * 0.4 + aRandom * 6.2831;
  float breatheSize = 1.0 + 0.10 * sin(breathePhase);
  float wobbleDamp = mix(1.0, 0.22, aAlpha);
  vec3 wobble = vec3(
    sin(breathePhase * 0.63 + aRandom * 3.0),
    cos(breathePhase * 0.51 + aRandom * 5.0),
    0.0
  ) * 0.006 * wobbleDamp * eased;
  finalPos += wobble;

  vColor = aColor;
  vAudioLevel = uAudioLevel;
  // Second, slightly phase-shifted breathing term folded into brightness so
  // size and brightness don't pulse in perfect lockstep (reads as organic
  // rather than a single mechanical throb).
  vAlpha = aAlpha * (1.0 + 0.08 * sin(breathePhase + 1.3));
  vShape = aShape;
  vAspect = aAspect;
  vRotation = aRotation;
  vSoftness = aSoftness;
  vGlow = aGlow;

  vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
  // aSize is the backend-baked per-particle size (contours/face/highlights
  // read larger, flat-fill dust reads smaller) — the client never computes
  // this, it only applies it alongside the existing assemble/audio/breathing
  // scaling. Elongated streaks additionally need a larger sprite footprint
  // so their long axis (drawn in the fragment shader via aAspect/aRotation)
  // has room to read as a stroke rather than being squeezed into a small
  // square.
  float aspectSizeBoost = mix(1.0, 1.55, clamp((aAspect - 1.0) / 5.0, 0.0, 1.0));
  gl_PointSize = uPointSize * aSize * aspectSizeBoost * breatheSize * uPixelRatio
    * (0.55 + 0.45 * eased) * (1.0 + uAudioLevel * 0.6) * mix(1.0, 0.72, uOrbit);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const particleFragmentShader = /* glsl */ `
precision mediump float;

uniform float uOpacity;
uniform float uExposure;
varying vec3 vColor;
varying float vAudioLevel;
varying float vAlpha;
varying float vShape;
varying float vAspect;
varying float vRotation;
varying float vSoftness;
varying float vGlow;

void main() {
  // Hybrid render: reinterpret the fixed square point sprite as an oriented,
  // optionally-elongated anisotropic falloff instead of one uniform round
  // dot. aShape/aAspect/aRotation/aSoftness/aGlow are baked server-side per
  // particle (see prayer_visualizer.rs::derive_shape_params) from real
  // image signals (highlight brightness/saturation, edge strength, local
  // contrast, gradient direction) — the shader never decides this itself,
  // it only draws exactly what was computed:
  //   shape 0 "splat"  — soft, round, wide falloff; overlaps neighbors into
  //                       dense light mass instead of isolated dust.
  //   shape 1 "point"  — small, sharp core with a tight bright center; fine
  //                       detail, catchlights, gilding.
  //   shape 2 "streak" — elongated along the local edge tangent (aRotation),
  //                       stretched by aAspect; hair, robe folds, contours.
  vec2 uv = (gl_PointCoord - 0.5) * 2.0;
  float ca = cos(vRotation);
  float sa = sin(vRotation);
  vec2 ruv = vec2(uv.x * ca + uv.y * sa, -uv.x * sa + uv.y * ca);
  ruv.x /= max(vAspect, 1.0);
  float dist = length(ruv);
  if (dist > 1.0) discard;

  // vSoftness in [0,1] sets the gaussian falloff width: tight for points,
  // wide for splats. A small extra bright core is added for "point"-shaped
  // particles (0.5 < vShape < 1.5) so highlights still read as crisp
  // catchlights rather than just a smaller soft blob.
  float sigma = mix(0.28, 0.85, vSoftness);
  float falloff = exp(-(dist * dist) / (2.0 * sigma * sigma));
  float isPoint = step(0.5, vShape) * step(vShape, 1.5);
  float core = isPoint * pow(max(1.0 - dist, 0.0), 4.0) * 0.6;
  float shapeAlpha = clamp(falloff + core, 0.0, 1.0);

  // A mostly-solid core with only a thin antialiased edge reads as a crisp
  // dot; the old full-gaussian falloff (0.5 -> 0.0) made every point a soft
  // haze that, once many overlapped under additive blending, muddied the
  // whole silhouette into fog instead of a sharp image. vAlpha carries both
  // the backend-baked per-particle opacity (contours/face/highlights read
  // more opaque, flat fill dust dimmer) and the breathing brightness pulse.
  float alpha = shapeAlpha * uOpacity * (0.95 + vAudioLevel * 0.35) * vAlpha;

  // This material writes gl_FragColor directly, so none of Three's built-in
  // tone-mapping/color-space shader chunks ever touch it — uExposure is the
  // real (and only) exposure control for this shader. vGlow (baked
  // server-side, strongest on highlight points) adds extra additive bloom
  // so overlapping particles read as glowing light mass, not flat dots.
  vec3 color = vColor * uExposure + vColor * vGlow * shapeAlpha * 0.6;
  gl_FragColor = vec4(color, alpha);
}
`;
