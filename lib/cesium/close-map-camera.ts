import type * as Cesium from '@cesium/engine';

/**
 * "Close map" camera for the single CesiumWidget: while the user zooms in, the
 * camera tilt is eased toward a height-dependent cap, so the far view stays a
 * normal 3D globe and the close view becomes a nearly top-down satellite map
 * (like Google Maps / Google Earth). Three zones by camera height:
 *
 *   GLOBAL    > 1 500 km   never touched, free tilt
 *   REGIONAL  200 – 1 500 km   tilt cap falls smoothly toward top-down
 *   CLOSE     < 200 km   nearly vertical: ~20° at 100 km, ~8° at 40 km, ~2.5° at 10 km, 0° at 5 km
 *
 * It never touches drag / rotate / flyTo and it only reduces tilt while the
 * camera is zooming in (wheel, pinch spread, right-drag, +/- buttons; never during a tilt or pan gesture, because tilting
 * also lowers the camera). A tilt the user sets by hand is honoured until they
 * zoom in to less than half of the height where they set it, so small zoom
 * adjustments do not undo it while the default close view stays top-down.
 * No widget, canvas or engine is created: it is one scene.preUpdate listener.
 */
type CesiumModule = typeof Cesium;

export type CameraZone = 'global' | 'regional' | 'close';
export const ZONE_HEIGHTS = { global: 1_500_000, close: 200_000 } as const;

/** [camera height in metres above the ellipsoid, largest preferred tilt in degrees from straight down]. */
export type TiltPoint = readonly [number, number];
export const TILT_POINTS: readonly TiltPoint[] = [
  [5_000, 0],
  [10_000, 2.5],
  [40_000, 8],
  [100_000, 20],
  [200_000, 34],
  [500_000, 52],
  [1_500_000, 70],
];

/**
 * Scene camera behaviour tuned together with the curve (Cesium ScreenSpaceCameraController properties).
 * zoomFactor is Cesium's own wheel / pinch speed multiplier (default 5): it stays 5 on the globe and eases down to
 * `zoomFactorClose` through the regional zone (minimumZoomDistance 40 m: Google satellite is sharp down to ~50 m camera height and visibly stretched below ~30 m), so one wheel notch is ~0.25 zoom level at street scale instead of ~0.4
 * and a hard trackpad flick cannot skip several levels.
 */
export const CAMERA_TUNING = { minimumZoomDistance: 40, zoomFactorFar: 5, zoomFactorClose: 3, inertiaZoom: 0.8 } as const;

export function zoomFactorFor(height: number) {
  const { global, close } = ZONE_HEIGHTS;
  const t = Math.min(1, Math.max(0, Math.log(global / Math.max(height, 1)) / Math.log(global / close)));
  return CAMERA_TUNING.zoomFactorFar + (CAMERA_TUNING.zoomFactorClose - CAMERA_TUNING.zoomFactorFar) * t * t * (3 - 2 * t);
}

export function zoneFor(height: number): CameraZone {
  return height > ZONE_HEIGHTS.global ? 'global' : height >= ZONE_HEIGHTS.close ? 'regional' : 'close';
}

/** Monotone cubic (Fritsch–Carlson) interpolation in log-height: smooth, no overshoot, no flat spots at the control points. */
export function createTiltCurve(points: readonly TiltPoint[] = TILT_POINTS) {
  const xs = points.map(([height]) => Math.log(height));
  const ys = points.map(([, tilt]) => (tilt * Math.PI) / 180);
  const count = xs.length;
  const delta: number[] = [];
  for (let index = 0; index < count - 1; index++) delta.push((ys[index + 1] - ys[index]) / (xs[index + 1] - xs[index]));
  const slope: number[] = new Array(count).fill(0);
  slope[0] = delta[0];
  slope[count - 1] = delta[count - 2];
  for (let index = 1; index < count - 1; index++) slope[index] = delta[index - 1] * delta[index] <= 0 ? 0 : (2 * delta[index - 1] * delta[index]) / (delta[index - 1] + delta[index]);
  const lowest = points[0][0];
  const highest = points[count - 1][0];
  /** Largest tilt (radians from nadir) the close-map view prefers at this camera height; Infinity = unrestricted. */
  return (height: number) => {
    if (!(height < highest)) return Infinity;
    if (height <= lowest) return ys[0];
    const x = Math.log(height);
    let segment = 0;
    while (segment < count - 2 && x > xs[segment + 1]) segment++;
    const width = xs[segment + 1] - xs[segment];
    const t = (x - xs[segment]) / width;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[segment] + (t3 - 2 * t2 + t) * width * slope[segment] + (-2 * t3 + 3 * t2) * ys[segment + 1] + (t3 - t2) * width * slope[segment + 1];
  };
}

export const preferredTilt = createTiltCurve();

/** Largest tilt change per frame (radians, ~3.4°): a big gap (e.g. a manual tilt expiring) is eased over several frames, never snapped. */
export const MAX_TILT_STEP = 0.06;

/** One easing step toward `cap`; `zoomed` is the relative height decrease of this frame (0 when not zooming in). */
export function easedTilt(tilt: number, cap: number, zoomed: number) {
  if (!(tilt > cap) || !(zoomed > 0)) return tilt;
  const step = Math.min((tilt - cap) * Math.min(1, zoomed * 6), MAX_TILT_STEP);
  const next = tilt - step;
  return next - cap < 0.002 ? cap : next;
}

/** A manual tilt lifts the cap while the camera stays above half of the height where it was set. */
export function effectiveCap(cap: number, height: number, manual: { tilt: number; height: number } | null) {
  return manual && height > manual.height * 0.5 ? Math.max(cap, manual.tilt) : cap;
}

export function closeMapEnabled(search = '') {
  return new URLSearchParams(search).get('closeMap') !== '0';
}

/** A pointer that is currently down on the canvas (mouse button, pen or finger). */
export type PointerState = { button: number; ctrl: boolean; x: number; y: number };
export type Gesture = 'none' | 'zoom' | 'tilt' | 'pan';

/**
 * What the user is doing, from Cesium's default input map: wheel / buttons / programmatic moves have no pointer down
 * ('none'), right-drag zooms, middle-drag or ctrl-drag tilts, left-drag pans, two fingers pinch (spreading = zoom,
 * a vertical drag of the midpoint = tilt). Tilting lowers the camera, so it must never be mistaken for zooming in.
 */
export function classifyGesture(pointers: readonly PointerState[], pinch?: { spread: number; midY: number }): Gesture {
  if (pointers.length === 0) return 'none';
  if (pointers.length >= 2) {
    if (!pinch) return 'tilt';
    const spread = Math.abs(pinch.spread);
    const midY = Math.abs(pinch.midY);
    // The very first frame of a new pinch has (near) zero delta either way; treat it as undecided rather than
    // defaulting to 'tilt', or every pinch-to-zoom would spuriously lock a manual tilt and disable the cap.
    if (spread < 1.5 && midY < 1.5) return 'none';
    return spread > 2 * midY ? 'zoom' : 'tilt';
  }
  const [pointer] = pointers;
  if (pointer.ctrl || pointer.button === 1) return 'tilt';
  if (pointer.button === 2) return 'zoom';
  return 'pan';
}

export function createCloseMapCamera(C: CesiumModule, widget: Cesium.CesiumWidget, options: { points?: readonly TiltPoint[] } = {}) {
  const { scene, camera, canvas } = widget;
  const controller = scene.screenSpaceCameraController;
  controller.minimumZoomDistance = CAMERA_TUNING.minimumZoomDistance;
  controller.zoomFactor = zoomFactorFor(camera.positionCartographic.height);
  controller.inertiaZoom = CAMERA_TUNING.inertiaZoom;
  let curve = createTiltCurve(options.points);
  const center = new C.Cartesian2();
  const pivot = new C.Cartesian3();
  const normal = new C.Cartesian3();
  const offset = new C.Cartesian3();
  let previous = camera.positionCartographic.height;
  let manual: { tilt: number; height: number } | null = null;
  let busy = false;
  // camera.flyTo runs as a scene tween (not in the public typings); never fight a flight.
  const flying = () => ((scene as unknown as { tweens?: { length: number } }).tweens?.length ?? 0) > 0;

  // Pointer tracking (listeners only observe; they never stop or change an event, Cesium keeps handling all input).
  const pointers = new Map<number, PointerState>();
  let pinchSpread = 0;
  let pinchMidY = 0;
  const track = (event: PointerEvent) => {
    pointers.set(event.pointerId, { button: event.button, ctrl: event.ctrlKey || event.metaKey, x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      // A new pinch just started: seed the baseline from its actual start so the first preUpdate tick sees a
      // ~zero delta instead of jumping from whatever spread/midY a previous, unrelated gesture left behind (which
      // would otherwise misclassify frame one as a big zoom or tilt and spuriously lock the manual-tilt override).
      const [a, b] = [...pointers.values()];
      pinchSpread = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMidY = (a.y + b.y) / 2;
    }
  };
  const move = (event: PointerEvent) => {
    const known = pointers.get(event.pointerId);
    if (known) {
      known.x = event.clientX;
      known.y = event.clientY;
      known.ctrl = event.ctrlKey || event.metaKey;
    }
  };
  const release = (event: PointerEvent) => { pointers.delete(event.pointerId); };
  const clear = () => { pointers.clear(); };
  const listen = { passive: true } as const;
  canvas.addEventListener('pointerdown', track, listen);
  canvas.addEventListener('pointermove', move, listen);
  window.addEventListener('pointerup', release, { passive: true, capture: true });
  window.addEventListener('pointercancel', release, { passive: true, capture: true });
  window.addEventListener('blur', clear);
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return undefined;
    const spread = Math.hypot(a.x - b.x, a.y - b.y);
    const midY = (a.y + b.y) / 2;
    const delta = { spread: spread - pinchSpread, midY: midY - pinchMidY };
    pinchSpread = spread;
    pinchMidY = midY;
    return delta;
  };

  const remove = scene.preUpdate.addEventListener(() => {
    if (busy || widget.isDestroyed()) return;
    const height = camera.positionCartographic.height;
    const before = previous;
    const tilt = Math.PI / 2 + camera.pitch;
    previous = height;
    controller.zoomFactor = zoomFactorFor(height);
    const gesture = classifyGesture([...pointers.values()], pointers.size >= 2 ? pinch() : undefined);
    if (scene.mode !== C.SceneMode.SCENE3D || flying()) return;
    if (height > ZONE_HEIGHTS.global) {
      manual = null;
      return;
    }
    // The user is tilting by hand: that tilt is theirs until they zoom in a lot further.
    if (gesture === 'tilt') {
      manual = { tilt, height };
      return;
    }
    if ((gesture !== 'none' && gesture !== 'zoom') || !(before > height)) return;
    const cap = effectiveCap(curve(height), height, manual);
    if (!Number.isFinite(cap) || !(tilt > cap + 0.002)) return;
    center.x = canvas.clientWidth / 2;
    center.y = canvas.clientHeight / 2;
    const ray = camera.getPickRay(center);
    const ground = ray ? (scene.globe.pick(ray, scene, pivot) ?? camera.pickEllipsoid(center, scene.globe.ellipsoid, pivot)) : undefined;
    if (!ground) return;
    const range = C.Cartesian3.distance(camera.positionWC, ground);
    if (!(range > 1)) return;
    // Orbit around the ground point under the screen centre while keeping the camera's altitude above it, so reducing the
    // tilt never lifts the camera away from what the user is zooming into.
    C.Cartesian3.subtract(camera.positionWC, ground, offset);
    scene.globe.ellipsoid.geodeticSurfaceNormal(ground, normal);
    const altitude = C.Cartesian3.dot(offset, normal);
    if (!(altitude > 1)) return;
    const next = easedTilt(tilt, cap, (before - height) / before);
    const pivotTilt = Math.max(0, Math.acos(Math.min(1, altitude / range)) - (tilt - next));
    const nextRange = altitude / Math.cos(Math.min(pivotTilt, 1.5));
    busy = true;
    try {
      camera.lookAt(ground, new C.HeadingPitchRange(camera.heading, pivotTilt - Math.PI / 2, nextRange));
      camera.lookAtTransform(C.Matrix4.IDENTITY);
      previous = camera.positionCartographic.height;
      scene.requestRender();
    } finally {
      busy = false;
    }
  });

  return {
    dispose: () => {
      remove();
      canvas.removeEventListener('pointerdown', track);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release, { capture: true });
      window.removeEventListener('pointercancel', release, { capture: true });
      window.removeEventListener('blur', clear);
    },
    /** Dev: swap the tilt curve while testing. */
    setPoints: (points: readonly TiltPoint[]) => { curve = createTiltCurve(points); },
  };
}
