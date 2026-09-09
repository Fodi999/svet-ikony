'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/site/LanguageProvider';

export type SelectedEventTarget = {
  latitude: number | null;
  longitude: number | null;
  modelUrl?: string | null;
} | null;

export type CameraCommand = { action: 'in' | 'out' | 'reset'; sequence: number };
export type MapEvent = { id: string; latitude: number; longitude: number; title: string; date: string };
const NO_MAP_EVENTS: MapEvent[] = [];

type Props = {
  baseEarthModelUrl: string | null;
  selectedEvent: SelectedEventTarget;
  fill?: boolean;
  showHint?: boolean;
  cameraCommand?: CameraCommand;
  mapEvents?: MapEvent[];
  onSelectEvent?: (id: string) => void;
};

function supportsWebGL2(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
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
  camera: import('@/lib/visualizer/base-scene').SceneCamera;
  overviewCamera: import('@/lib/visualizer/base-scene').SceneCamera;
  baseMixer: import('three').AnimationMixer | null;
  authoredScene: boolean;
  earthGroup: import('three').Group;
  eventGroup: import('three').Group;
  pins: import('three').Group;
  earthSurface: import('three').Object3D | null;
  surfaceRestInverse: import('three').Matrix4 | null;
  layoutOverview: ((aspect: number) => void) | null;
  updateMarkerOverlay: (() => void) | null;
  transitioning: boolean;
  focused: boolean;
  controls: import("three/addons/controls/OrbitControls.js").OrbitControls;
  mixer: import("three").AnimationMixer | null;
};

/**
 * The actual WebGL scene: a built-in Earth, optionally replaced by an
 * uploaded GLB, free orbit/zoom via OrbitControls when idle, and
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
export function Earth3DCanvas({ baseEarthModelUrl, selectedEvent, fill = false, showHint = true, cameraCommand, mapEvents = NO_MAP_EVENTS, onSelectEvent }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const [webglSupported, setWebglSupported] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadedModelUrl, setLoadedModelUrl] = useState<string | null>(null);
  const [failedModelUrl, setFailedModelUrl] = useState<string | null>(null);
  const eventError = !!selectedEvent?.modelUrl && failedModelUrl === selectedEvent.modelUrl;
  const eventLoading = !!selectedEvent?.modelUrl && loadedModelUrl !== selectedEvent.modelUrl && !eventError;
  const [sceneError, setSceneError] = useState(false);
  const [usingDefaultEarth, setUsingDefaultEarth] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setWebglSupported(supportsWebGL2()));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Builds the scene when WebGL2 is available. Rebuilt only if the base
  // model URL itself changes (e.g. the
  // admin swaps the active Base Earth Model) -- event selection is handled
  // by the separate effect below, reaching into the already-running scene.
  useEffect(() => {
    if (!webglSupported) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;


    let disposed = false;
    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let controlsDispose: (() => void) | null = null;
    let rendererDispose: (() => void) | null = null;
    let sceneDispose: (() => void) | null = null;
    let hidden = document.hidden;

    let resumeRendering: (() => void) | null = null;
    function onVisibilityChange() {
      hidden = document.hidden;
      if (hidden) cancelAnimationFrame(rafId);
      else resumeRendering?.();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    void (async () => {
      const reducedMotion = prefersReducedMotion();
      const [THREE, { GLTFLoader }, { OrbitControls }, { createDefaultEarth }, { prepareBaseScene, resizeSceneCamera, composeEarthOverview }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js'),
        import('@/lib/visualizer/default-earth'),
        import('@/lib/visualizer/base-scene')
      ]);
      if (disposed) return;
      setSceneError(false);
      setSceneReady(false);
      setUsingDefaultEarth(true);

      const scene = new THREE.Scene();
      const rect = container.getBoundingClientRect();
      let camera: import('@/lib/visualizer/base-scene').SceneCamera = new THREE.PerspectiveCamera(45, (rect.width || 1) / (rect.height || 1), 0.1, 100);
      camera.position.set(0, 0, 6);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(rect.width || 1, rect.height || 1, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererDispose = () => renderer.dispose();

      const ambient = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambient);
      const directional = new THREE.DirectionalLight(0xffffff, 1.1);
      directional.position.set(5, 3, 5);
      scene.add(directional);

      const earthGroup = new THREE.Group();
      const eventGroup = new THREE.Group();
      const pins = new THREE.Group();
      scene.add(earthGroup, eventGroup, pins);
      sceneDispose = () => disposeObject3D(scene);

      const controls = new OrbitControls<import('@/lib/visualizer/base-scene').SceneCamera>(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 3;
      controls.maxDistance = 10;
      controls.enablePan = false;
      controlsDispose = () => controls.dispose();

      // Render immediately, even when no base GLB has been uploaded or its
      // request never completes. Replace only after a custom model is ready.
      const defaultEarth = createDefaultEarth();
      earthGroup.add(defaultEarth);
      if (baseEarthModelUrl) {
        void new GLTFLoader().loadAsync(baseEarthModelUrl).then((gltf) => {
          if (disposed) {
            disposeObject3D(gltf.scene);
            return;
          }
          const { model, camera: authoredCamera } = prepareBaseScene(gltf);
          earthGroup.remove(defaultEarth);
          disposeObject3D(defaultEarth);
          earthGroup.rotation.set(0, 0, 0);
          earthGroup.add(model);
          handle.earthSurface = model.getObjectByName('Earth') ?? null;
          handle.earthSurface?.updateWorldMatrix(true, false);
          handle.surfaceRestInverse = handle.earthSurface?.matrixWorld.clone().invert() ?? null;
          handle.authoredScene = !!authoredCamera;
          if (authoredCamera) {
            // An exported scene includes its intended composition; a sky dome
            // must not become the object that the viewer frames from outside.
            const box = container.getBoundingClientRect();
            const compose = composeEarthOverview(model, authoredCamera);
            compose((box.width || 1) / (box.height || 1));
            handle.layoutOverview = (aspect) => {
              compose(aspect);
              handle.overviewCamera = authoredCamera.clone();
              if (handle.camera instanceof THREE.OrthographicCamera && authoredCamera instanceof THREE.OrthographicCamera) {
                handle.camera.top = authoredCamera.top; handle.camera.bottom = authoredCamera.bottom;
                handle.camera.left = authoredCamera.left; handle.camera.right = authoredCamera.right;
                handle.camera.updateProjectionMatrix();
              }
            };
            handle.overviewCamera = authoredCamera.clone();
            controls.maxDistance = Math.max(10, authoredCamera.position.length() * 2);
            controls.minZoom = 0.5;
            controls.maxZoom = 5;
            if (!handle.focused) {
              camera = authoredCamera;
              handle.camera = camera;
              controls.object = camera;
              controls.target.set(0, 0, 0);
              controls.update();
            }
            const lights: import('three').Light[] = [];
            gltf.scene.traverse((node) => { if (node instanceof THREE.Light) lights.push(node); });
            if (lights.length) {
              // Blender's exported photometric energies can wash out a web
              // preview. Preserve their ratios while fitting display lighting.
              const peak = Math.max(...lights.map((light) => light.intensity));
              if (peak > 3) lights.forEach((light) => { light.intensity *= 3 / peak; });
              ambient.intensity = 0.12;
              directional.visible = false;
            }
          }
          if (gltf.animations?.length && !reducedMotion) {
            handle.baseMixer = new THREE.AnimationMixer(gltf.scene);
            handle.baseMixer.clipAction(gltf.animations[0]).play();
          }
          setUsingDefaultEarth(false);
        }).catch((error: unknown) => {
          if (!disposed) {
            console.warn('Could not load the Earth model; using the built-in globe.', error);
            setUsingDefaultEarth(true);
          }
        });
      }

      resizeObserver = new ResizeObserver(() => {
        const box = container.getBoundingClientRect();
        resizeSceneCamera(handle.camera, (box.width || 1) / (box.height || 1));
        resizeSceneCamera(handle.overviewCamera, (box.width || 1) / (box.height || 1));
        handle.layoutOverview?.((box.width || 1) / (box.height || 1));
        renderer.setSize(box.width || 1, box.height || 1, false);
      });
      resizeObserver.observe(container);

      const handle: SceneHandle = { THREE, camera, earthGroup, eventGroup, pins, earthSurface: null, surfaceRestInverse: null, layoutOverview: null, updateMarkerOverlay: null, transitioning: false, focused: false, controls, mixer: null, overviewCamera: camera.clone(), baseMixer: null, authoredScene: false };
      sceneRef.current = handle;
      renderer.render(scene, camera);
      setSceneReady(true);

      const pinPosition = new THREE.Vector3();
      const cameraToPin = new THREE.Vector3();
      let lastFrame = performance.now();
      function tick() {
        if (disposed || hidden) return;
        const now = performance.now();
        const delta = Math.min((now - lastFrame) / 1000, 0.05);
        lastFrame = now;
        if (!hidden) {
          if (!handle.transitioning && !handle.focused && !handle.authoredScene && !reducedMotion) earthGroup.rotation.y += delta * 0.055;
          if (!handle.focused) handle.baseMixer?.update(delta);
          handle.mixer?.update(delta);
          if (earthGroup.visible) eventGroup.rotation.copy(earthGroup.rotation);
          if (handle.earthSurface && handle.surfaceRestInverse) {
            handle.earthSurface.updateWorldMatrix(true, false);
            pins.matrixAutoUpdate = false;
            pins.matrix.copy(handle.earthSurface.matrixWorld).multiply(handle.surfaceRestInverse);
          } else pins.rotation.copy(earthGroup.rotation);
          pins.visible = earthGroup.visible;
          // Only the near hemisphere is clickable/visible (no pins through Earth).
          pins.updateMatrixWorld(true);
          const orthographic = handle.camera instanceof THREE.OrthographicCamera;
          if (orthographic) handle.camera.getWorldDirection(cameraToPin).negate();
          for (const pin of pins.children) {
            const point = pin.getWorldPosition(pinPosition);
            const direction = orthographic
              ? cameraToPin
              : cameraToPin.copy(handle.camera.position).sub(point);
            pin.visible = point.dot(direction) > 0;
          }
          if (!handle.transitioning) controls.update();
          handle.updateMarkerOverlay?.();
          renderer.render(scene, handle.camera);
        }
        rafId = requestAnimationFrame(tick);
      }
      resumeRendering = () => { lastFrame = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick); };
      if (!hidden) resumeRendering();
    })().catch((error: unknown) => {
      if (disposed) return;
      console.error('Could not initialize the history scene.', error);
      setSceneError(true);
    });

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      controlsDispose?.();
      sceneRef.current?.mixer?.stopAllAction();
      sceneRef.current?.baseMixer?.stopAllAction();
      sceneDispose?.();
      rendererDispose?.();
      sceneRef.current = null;
      setSceneReady(false);
    };
  }, [webglSupported, baseEarthModelUrl]);

  // Camera-to-event transition + lazy-load the event's own GLB (if any).
  // Runs whenever the selected event changes, reaching into the
  // already-running scene set up by the effect above.
  useEffect(() => {
    const handle = sceneRef.current;
    if (!handle || !sceneReady) return;
    let cancelled = false;

    handle.mixer?.stopAllAction();
    handle.mixer = null;
    handle.controls.enabled = true;
    handle.earthGroup.visible = true;
    handle.eventGroup.rotation.set(0, 0, 0);
    handle.focused = !!selectedEvent;

    // Always clear the previously-loaded event mesh first, regardless of
    // whether the new selection has one of its own.
    while (handle.eventGroup.children.length) {
      const child = handle.eventGroup.children[0];
      handle.eventGroup.remove(child);
      disposeObject3D(child);
    }

    if (!selectedEvent) {
      handle.camera = handle.overviewCamera.clone();
      handle.controls.object = handle.camera;
      handle.earthGroup.rotation.set(0, 0, 0);
      handle.controls.target.set(0, 0, 0);
      handle.controls.update();
      return;
    }
    handle.baseMixer?.setTime(0);
    const hasCoordinates = selectedEvent.latitude != null && selectedEvent.longitude != null;

    const { latitude, longitude, modelUrl } = selectedEvent;
    const latRad = ((latitude ?? 0) * Math.PI) / 180;
    const lngRad = ((longitude ?? 0) * Math.PI) / 180;
    const marker = new handle.THREE.Mesh(
      new handle.THREE.SphereGeometry(0.045, 16, 12),
      new handle.THREE.MeshBasicMaterial({ color: 0xffdd88 })
    );
    marker.position.setFromSphericalCoords(1.85, Math.PI / 2 - latRad, lngRad);
    if (hasCoordinates) handle.eventGroup.add(marker);
    else { marker.geometry.dispose(); marker.material.dispose(); }

    handle.transitioning = true;
    handle.controls.enabled = false;
    const spherical = new handle.THREE.Spherical().setFromVector3(handle.camera.position);
    const radius = spherical.radius;
    const startZoom = handle.camera.zoom;
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
    const targetPolar = Math.PI / 2 - latRad;

    const duration = prefersReducedMotion() ? 0 : 1400;
    const startTime = performance.now();
    let transitionFrame = 0;

    function animate(now: number) {
      if (cancelled) return;
      const progress = duration === 0 ? 1 : Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(progress);

      handle!.earthGroup.rotation.y = startYaw + yawDelta * eased;

      const nextPolar = startPolar + (targetPolar - startPolar) * eased;
      const nextPosition = new handle!.THREE.Vector3().setFromSphericalCoords(radius + ((hasCoordinates ? 3.4 : 6) - radius) * eased, nextPolar, cameraTheta);
      handle!.camera.position.copy(nextPosition);
      handle!.camera.lookAt(0, 0, 0);
      if (handle!.camera instanceof handle!.THREE.OrthographicCamera) {
        handle!.camera.zoom = startZoom + ((hasCoordinates ? 2.2 : 1) - startZoom) * eased;
        handle!.camera.updateProjectionMatrix();
      }

      if (progress < 1) {
        transitionFrame = requestAnimationFrame(animate);
      } else {
        handle!.transitioning = false;
        handle!.controls.enabled = true;
      }
    }
    transitionFrame = requestAnimationFrame(animate);

    let modelTimeout: ReturnType<typeof setTimeout> | undefined;
    if (modelUrl) {
      modelTimeout = setTimeout(() => { if (!cancelled) { setFailedModelUrl(modelUrl); } }, 30_000);
      void (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(modelUrl);
        if (cancelled || sceneRef.current !== handle) {
          disposeObject3D(gltf.scene);
          return;
        }
        const bounds = new handle.THREE.Box3().setFromObject(gltf.scene);
        const dimensions = bounds.getSize(new handle.THREE.Vector3());
        const size = Math.max(dimensions.x, dimensions.y, dimensions.z);
        if (!Number.isFinite(size) || size <= 0) { disposeObject3D(gltf.scene); throw new Error('Empty model'); }
        const asset = new handle.THREE.Group();
        gltf.scene.position.sub(bounds.getCenter(new handle.THREE.Vector3()));
        asset.add(gltf.scene);
        asset.scale.setScalar((hasCoordinates ? 0.8 : 2.8) / size);
        if (hasCoordinates) {
          asset.position.setFromSphericalCoords(2.05, Math.PI / 2 - latRad, lngRad);
          asset.quaternion.setFromUnitVectors(new handle.THREE.Vector3(0, 1, 0), asset.position.clone().normalize());
        } else {
          handle.earthGroup.visible = false;
          handle.eventGroup.rotation.set(0, 0, 0);
        }
        handle.eventGroup.add(asset);
        if (gltf.animations.length && !prefersReducedMotion()) {
          handle.mixer = new handle.THREE.AnimationMixer(gltf.scene);
          handle.mixer.clipAction(gltf.animations[0]).play();
        }
        clearTimeout(modelTimeout);
        setFailedModelUrl(null);
        setLoadedModelUrl(modelUrl);
      })().catch((error: unknown) => {
        if (!cancelled) { console.warn('Could not load the event model.', error); setFailedModelUrl(modelUrl); }
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(modelTimeout);
      cancelAnimationFrame(transitionFrame);
      handle.transitioning = false;
      handle.controls.enabled = true;
    };
  }, [selectedEvent, sceneReady]);

  // Keep event GLBs lazy: these lightweight location pins contain no models.
  useEffect(() => {
    const handle = sceneRef.current;
    const canvas = canvasRef.current;
    if (!handle || !sceneReady || !canvas) return;
    const geometry = new handle.THREE.SphereGeometry(0.045, 10, 8);
    const material = new handle.THREE.MeshBasicMaterial({ color: 0xe9cb84 });
    for (const event of mapEvents) {
      const pin = new handle.THREE.Mesh(geometry, material);
      pin.position.setFromSphericalCoords(1.86, Math.PI / 2 - event.latitude * Math.PI / 180, event.longitude * Math.PI / 180);
      pin.userData.eventId = event.id;
      pin.userData.label = `${event.title}\n${event.date}`;
      handle.pins.add(pin);
    }
    const raycaster = new handle.THREE.Raycaster();
    const pointer = new handle.THREE.Vector2();
    const projected = new handle.THREE.Vector3();
    const tooltip = tooltipRef.current;
    let hovered: import('three').Object3D | null = null;
    let down: { x: number; y: number } | null = null;
    function hideTooltip() { hovered = null; if (tooltip) tooltip.hidden = true; }
    handle.updateMarkerOverlay = () => {
      if (!tooltip || !hovered || !hovered.visible || !handle.pins.visible) { if (tooltip && !tooltip.hidden) tooltip.hidden = true; return; }
      hovered.getWorldPosition(projected).project(handle.camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) { tooltip.hidden = true; return; }
      const rect = canvas.getBoundingClientRect();
      tooltip.hidden = false;
      if (tooltip.textContent !== hovered.userData.label) tooltip.textContent = hovered.userData.label;
      const halfWidth = Math.min(tooltip.offsetWidth / 2, rect.width / 2);
      tooltip.style.left = `${Math.max(halfWidth, Math.min(rect.width - halfWidth, (projected.x + 1) * rect.width / 2))}px`;
      tooltip.style.top = `${Math.max(tooltip.offsetHeight + 8, (1 - projected.y) * rect.height / 2 - 12)}px`;
    };
    function hitAt(event: PointerEvent) {
      if (!handle!.pins.visible) return undefined;
      const rect = canvas!.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      raycaster.setFromCamera(pointer, handle!.camera);
      return raycaster.intersectObjects(handle!.pins.children.filter((pin) => pin.visible), false)[0]?.object;
    }
    function pointerDown(event: PointerEvent) { down = { x: event.clientX, y: event.clientY }; hideTooltip(); }
    function pointerMove(event: PointerEvent) {
      if (down || (event.pointerType && event.pointerType !== 'mouse')) { hideTooltip(); return; }
      hovered = hitAt(event) ?? null;
      handle!.updateMarkerOverlay?.();
    }
    function pointerUp(event: PointerEvent) {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) { down = null; return; }
      down = null;
      const hit = hitAt(event);
      if (hit) onSelectEvent?.(hit.userData.eventId);
    }
    function pointerCancel() { down = null; hideTooltip(); }
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerleave', hideTooltip);
    canvas.addEventListener('pointercancel', pointerCancel);
    return () => {
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerleave', hideTooltip);
      canvas.removeEventListener('pointercancel', pointerCancel);
      handle.updateMarkerOverlay = null; hideTooltip();
      handle.pins.clear(); geometry.dispose(); material.dispose();
    };
  }, [mapEvents, onSelectEvent, sceneReady]);

  useEffect(() => {
    const handle = sceneRef.current;
    if (!handle || !cameraCommand || !sceneReady || handle.transitioning) return;
    if (cameraCommand.action === 'reset') {
      handle.camera = handle.overviewCamera.clone();
      handle.controls.object = handle.camera;
      handle.controls.target.set(0, 0, 0);
      handle.earthGroup.rotation.set(0, 0, 0);
    } else {
      const factor = cameraCommand.action === 'in' ? 1.25 : 0.8;
      if (handle.camera instanceof handle.THREE.OrthographicCamera) {
        handle.camera.zoom = Math.min(handle.controls.maxZoom, Math.max(handle.controls.minZoom, handle.camera.zoom * factor));
        handle.camera.updateProjectionMatrix();
      } else {
        const distance = Math.min(handle.controls.maxDistance, Math.max(handle.controls.minDistance, handle.camera.position.length() / factor));
        handle.camera.position.setLength(distance);
      }
    }
    handle.controls.update();
  }, [cameraCommand, sceneReady]);

  if (!webglSupported) {
    return (
      <div className={`grid place-items-center bg-[#141511] p-8 text-center text-muted-foreground ${fill ? 'h-full min-h-0' : 'min-h-[360px] rounded-md border border-gold/28'}`}>
        {t('historyWebglUnavailable')}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden bg-[#070706] ${fill ? 'h-full min-h-0' : 'aspect-video min-h-[360px] rounded-md border border-gold/28'}`}>
      <canvas ref={canvasRef} aria-label={t('historyGlobeLabel')} className="block h-full w-full" style={{ visibility: sceneReady && !sceneError ? 'visible' : 'hidden' }} />
      <div ref={tooltipRef} hidden role="tooltip" className="pointer-events-none absolute z-10 max-w-[min(240px,90%)] -translate-x-1/2 -translate-y-full whitespace-pre-line rounded-md border border-gold/30 bg-canvas/95 px-3 py-2 text-xs leading-relaxed text-gold-light shadow-lg" />
      {!sceneReady || sceneError ? (
        <div role="status" className="absolute inset-0 grid place-items-center p-8 text-center text-muted-foreground text-sm font-bold">{t(sceneError ? 'historySceneError' : 'historyLoadingScene')}</div>
      ) : null}
      {eventLoading || eventError ? <div role="status" className="absolute top-4 left-4 right-4 rounded-md bg-canvas/90 p-3 text-sm text-foreground">{t(eventError ? 'historyEventModelError' : 'historyEventModelLoading')}</div> : null}
      {showHint && sceneReady && !sceneError ? (
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{t('historyGlobeHint')}</span>
          {usingDefaultEarth ? <span>{t('historyDefaultGlobe')}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
