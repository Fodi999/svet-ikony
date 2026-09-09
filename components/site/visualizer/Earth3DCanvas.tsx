'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/site/LanguageProvider';

export type SelectedEventTarget = {
  latitude: number | null;
  longitude: number | null;
  modelUrl?: string | null;
} | null;

type Props = {
  baseEarthModelUrl: string | null;
  selectedEvent: SelectedEventTarget;
};

function supportsWebGL2(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Shortest signed angular distance from `from` to `to`, in radians --
 * without this, a transition crossing the -180/180 longitude seam would
 * spin the long way around instead of the short way. */
function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}

/** Recursively disposes a loaded GLTF scene graph's geometries/materials/
 * textures. Needed for event-specific GLBs that get swapped out while the
 * page stays open (the base earth model is loaded once and never disposed
 * until the whole canvas unmounts) -- without this, switching between
 * several events would leak GPU memory. */
function disposeObject3D(object: import('three').Object3D) {
  object.traverse((child) => {
    const mesh = child as import('three').Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as unknown as { material?: import('three').Material | import('three').Material[] }).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const mat of materials) {
      for (const value of Object.values(mat)) {
        if (value && typeof value === 'object' && 'isTexture' in value) {
          (value as import('three').Texture).dispose();
        }
      }
      mat.dispose();
    }
  });
}

type SceneHandle = {
  THREE: typeof import('three');
  camera: import('three').PerspectiveCamera;
  earthGroup: import('three').Group;
  eventGroup: import('three').Group;
  transitioning: boolean;
};

/**
 * The actual WebGL scene: a slowly-spinning Earth (GLTFLoader-loaded base
 * model, lazy-imported), free orbit/zoom via OrbitControls when idle, and
 * an eased camera-to-event transition when `selectedEvent` has coordinates
 * (rotates the Earth mesh — not the camera — around Y for longitude, and
 * sweeps the camera's polar angle for latitude; see the effect below for
 * the exact convention). Mirrors PrayerVisualizerCanvas.tsx's structure
 * (WebGL2 gate, lazy dynamic import inside useEffect, full manual
 * disposal) — the established pattern for heavy client-only 3D in this
 * repo — plus two additions that component didn't need: pausing the
 * render loop on `document.visibilitychange`, and disposing/reloading a
 * second (event-specific) GLB on selection change.
 */
export function Earth3DCanvas({ baseEarthModelUrl, selectedEvent }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);

  const [webglSupported, setWebglSupported] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    setWebglSupported(supportsWebGL2());
  }, []);

  // Builds the scene once, when WebGL2 is confirmed and the base model URL
  // is known. Rebuilt only if the base model URL itself changes (e.g. the
  // admin swaps the active Base Earth Model) -- event selection is handled
  // by the separate effect below, reaching into the already-running scene.
  useEffect(() => {
    if (!webglSupported || !baseEarthModelUrl) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;
    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let controlsDispose: (() => void) | null = null;
    let rendererDispose: (() => void) | null = null;
    let hidden = document.hidden;

    function onVisibilityChange() {
      hidden = document.hidden;
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    void (async () => {
      const reducedMotion = prefersReducedMotion();
      const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js')
      ]);
      if (disposed) return;

      const scene = new THREE.Scene();
      const rect = container.getBoundingClientRect();
      const camera = new THREE.PerspectiveCamera(45, (rect.width || 1) / (rect.height || 1), 0.1, 100);
      camera.position.set(0, 0, 6);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(rect.width || 1, rect.height || 1, false);
      rendererDispose = () => renderer.dispose();

      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const directional = new THREE.DirectionalLight(0xffffff, 1.1);
      directional.position.set(5, 3, 5);
      scene.add(directional);

      const earthGroup = new THREE.Group();
      const eventGroup = new THREE.Group();
      scene.add(earthGroup, eventGroup);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 3;
      controls.maxDistance = 10;
      controls.enablePan = false;
      controlsDispose = () => controls.dispose();

      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(baseEarthModelUrl);
      if (disposed) return;
      earthGroup.add(gltf.scene);
      setSceneReady(true);

      resizeObserver = new ResizeObserver(() => {
        const box = container.getBoundingClientRect();
        camera.aspect = (box.width || 1) / (box.height || 1);
        camera.updateProjectionMatrix();
        renderer.setSize(box.width || 1, box.height || 1, false);
      });
      resizeObserver.observe(container);

      const handle: SceneHandle = { THREE, camera, earthGroup, eventGroup, transitioning: false };
      sceneRef.current = handle;

      function tick() {
        if (disposed) return;
        if (!hidden) {
          if (!handle.transitioning && !reducedMotion) earthGroup.rotation.y += 0.0009;
          controls.update();
          renderer.render(scene, camera);
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      controlsDispose?.();
      if (sceneRef.current) {
        disposeObject3D(sceneRef.current.eventGroup);
        disposeObject3D(sceneRef.current.earthGroup);
      }
      rendererDispose?.();
      sceneRef.current = null;
      setSceneReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglSupported, baseEarthModelUrl]);

  // Camera-to-event transition + lazy-load the event's own GLB (if any).
  // Runs whenever the selected event changes, reaching into the
  // already-running scene set up by the effect above.
  useEffect(() => {
    const handle = sceneRef.current;
    if (!handle || !sceneReady) return;
    let cancelled = false;

    // Always clear the previously-loaded event mesh first, regardless of
    // whether the new selection has one of its own.
    while (handle.eventGroup.children.length) {
      const child = handle.eventGroup.children.pop()!;
      disposeObject3D(child);
    }

    if (!selectedEvent || selectedEvent.latitude == null || selectedEvent.longitude == null) return;

    const { latitude, longitude, modelUrl } = selectedEvent;
    const latRad = (latitude * Math.PI) / 180;
    const lngRad = (longitude * Math.PI) / 180;

    handle.transitioning = true;
    const spherical = new handle.THREE.Spherical().setFromVector3(handle.camera.position);
    const radius = spherical.radius;
    const cameraTheta = spherical.theta; // kept fixed -- only phi (latitude tilt) animates on the camera
    const startPolar = spherical.phi;
    // A world-space point at longitude `lngRad` (before any Earth rotation)
    // sits at azimuthal angle `lngRad`; after rotating the Earth by `yaw`,
    // it sits at `lngRad + yaw`. For that point to face the camera (i.e.
    // land at the camera's own azimuthal angle), yaw = cameraTheta - lngRad.
    const targetYaw = cameraTheta - lngRad;
    const startYaw = handle.earthGroup.rotation.y;
    const yawDelta = shortestAngleDelta(startYaw, targetYaw);
    // Latitude sweeps the camera's polar angle around the equatorial default
    // (PI/2), damped so near-polar events don't fully flatten the view.
    const targetPolar = Math.PI / 2 - latRad * 0.6;

    const duration = 1400;
    const startTime = performance.now();

    function animate(now: number) {
      if (cancelled) return;
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(progress);

      handle!.earthGroup.rotation.y = startYaw + yawDelta * eased;

      const nextPolar = startPolar + (targetPolar - startPolar) * eased;
      const nextPosition = new handle!.THREE.Vector3().setFromSphericalCoords(radius, nextPolar, cameraTheta);
      handle!.camera.position.copy(nextPosition);
      handle!.camera.lookAt(0, 0, 0);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        handle!.transitioning = false;
      }
    }
    requestAnimationFrame(animate);

    if (modelUrl) {
      void (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(modelUrl);
        if (cancelled || sceneRef.current !== handle) {
          disposeObject3D(gltf.scene);
          return;
        }
        handle.eventGroup.add(gltf.scene);
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedEvent, sceneReady]);

  if (!webglSupported) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-md border border-gold/28 bg-[#141511] p-8 text-center text-muted-foreground">
        {t('historyWebglUnavailable')}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative aspect-video w-full min-h-[360px] overflow-hidden rounded-md border border-gold/28 bg-[radial-gradient(circle_at_50%_35%,rgba(205,164,90,.13),transparent_35%),#070706]">
      <canvas ref={canvasRef} className="block h-full w-full" style={{ visibility: sceneReady ? 'visible' : 'hidden' }} />
      {!sceneReady ? (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm font-bold">{t('historyLoadingScene')}</div>
      ) : null}
    </div>
  );
}
