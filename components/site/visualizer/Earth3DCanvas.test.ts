import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise scene setup with real Three.js geometry and fake GPU/DOM boundaries.
// In particular, a missing or stalled GLB must not hold up the first render.
const harness = vi.hoisted(() => ({
  ready: false,
  effects: [] as (() => void | (() => void))[],
  refs: [] as { current: unknown }[],
  setters: [] as ReturnType<typeof vi.fn>[],
  render: vi.fn(),
  dispose: vi.fn(),
  load: vi.fn(),
}));

vi.mock('react', () => ({
  useRef: () => {
    const ref = { current: null };
    harness.refs.push(ref);
    return ref;
  },
  useState: (initial: unknown) => {
    const setter = vi.fn();
    harness.setters.push(setter);
    return [harness.setters.length === 2 && harness.ready ? true : initial, setter];
  },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock('@/components/site/LanguageProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    domElement = {};
    setPixelRatio() {}
    setSize() {}
    render = harness.render;
    dispose = harness.dispose;
  },
}));
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class { target = { set() {} }; update() {} dispose() {} },
}));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { loadAsync = harness.load; },
}));

import { Earth3DCanvas } from './Earth3DCanvas';

let cleanup: (() => void) | void;
beforeEach(() => {
  vi.clearAllMocks();
  harness.ready = false;
  harness.effects = [];
  harness.refs = [];
  harness.setters = [];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }));
  vi.stubGlobal('window', { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(baseEarthModelUrl: string | null, selectedEvent: import("./Earth3DCanvas").SelectedEventTarget = null, extra: Partial<Parameters<typeof Earth3DCanvas>[0]> = {}) {
  Earth3DCanvas({ baseEarthModelUrl, selectedEvent, ...extra });
  harness.refs[0].current = { getBoundingClientRect: () => ({ width: 960, height: 540 }) };
  harness.refs[1].current = {};
  cleanup = harness.effects[1]();
}

describe('history scene startup', () => {
  it('renders a globe with real coastline geometry when no model is configured', async () => {
    mount(null);
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    expect(harness.load).not.toHaveBeenCalled();
    expect(harness.setters[1]).toHaveBeenCalledWith(true);
    const scene = harness.render.mock.calls[0][0] as import('three').Scene;
    const globe = scene.children[2].children[0];
    expect(globe.children.length).toBeGreaterThan(100);
    const geometryDispose = vi.spyOn((globe.children[0] as import('three').Mesh).geometry, 'dispose');
    cleanup?.();
    cleanup = undefined;
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(harness.dispose).toHaveBeenCalledOnce();
  });

  it('renders immediately even if a model request never completes', async () => {
    harness.load.mockReturnValue(new Promise(() => {}));
    mount('/media/stalled.glb');
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    expect(harness.setters[1]).toHaveBeenCalledWith(true);
  });

  it('keeps the built-in globe when a custom model fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    harness.load.mockRejectedValue(new Error('404'));
    mount('/media/missing.glb');
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(harness.render).toHaveBeenCalled();
    expect(harness.setters[5]).toHaveBeenLastCalledWith(true);
  });

  it('ends the loading state with an error message if GPU initialization fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.render.mockImplementationOnce(() => { throw new Error('GPU unavailable'); });
    mount(null);
    await vi.waitFor(() => expect(harness.setters[4]).toHaveBeenCalledWith(true));
    expect(harness.setters[1]).not.toHaveBeenCalledWith(true);
  });
});


describe('event scenes', () => {
  it('loads and fits a model without geographic coordinates', async () => {
    const THREE = await import('three');
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial()));
    harness.load.mockResolvedValue({ scene: model, animations: [] });
    harness.ready = true;
    mount(null, { latitude: null, longitude: null, modelUrl: '/media/event.glb' });
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    const eventCleanup = harness.effects[2]();
    await vi.waitFor(() => expect(harness.setters[2]).toHaveBeenCalledWith('/media/event.glb'));
    const scene = harness.render.mock.calls[0][0] as import('three').Scene;
    expect(scene.children[2].visible).toBe(false);
    const bounds = new THREE.Box3().setFromObject(scene.children[3]);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(2.8);
    eventCleanup?.();
  });
  it('zooms smoothly to the selected geographic region', async () => {
    harness.ready = true;
    mount(null, { latitude: 50.45, longitude: 30.52 });
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    const eventCleanup = harness.effects[2]();
    const animate = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    animate(performance.now() + 1500);
    const camera = harness.render.mock.calls[0][1] as import('three').PerspectiveCamera;
    expect(camera.position.length()).toBeCloseTo(3.4);
    eventCleanup?.();
  });
});


describe('scene toolbar', () => {
  it('zooms the existing camera without rebuilding the renderer', async () => {
    harness.ready = true;
    mount(null, null, { cameraCommand: { action: 'in', sequence: 1 } });
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    const camera = harness.render.mock.calls[0][1] as import('three').PerspectiveCamera;
    harness.effects[4]();
    expect(camera.position.length()).toBeCloseTo(4.8);
    expect(harness.render).toHaveBeenCalledOnce();
  });
  it('keeps pins attached to rotation inside an uploaded Earth scene', async () => {
    const THREE = await import('three');
    const asset = new THREE.Group();
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
    earth.name = 'Earth'; asset.add(earth);
    harness.load.mockResolvedValue({ scene: asset, cameras: [], animations: [] });
    harness.ready = true;
    mount('/earth.glb', null, { mapEvents: [{ id: 'point', latitude: 0, longitude: 0, title: 'Point', date: '313' }] });
    harness.refs[1].current = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) };
    await vi.waitFor(() => expect(harness.setters[5]).toHaveBeenLastCalledWith(false));
    const cleanPins = harness.effects[3]();
    const tick = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    const scene = harness.render.mock.calls[0][0] as import('three').Scene;
    earth.rotation.y = Math.PI;
    tick(performance.now());
    const pin = scene.children[4].children[0];
    expect(pin.getWorldPosition(new THREE.Vector3()).z).toBeCloseTo(-1.86, 2);
    expect(pin.visible).toBe(false);
    const geography = scene.getObjectByName('EarthGeography')!;
    expect(geography.matrix.elements).toEqual(scene.children[4].matrixWorld.elements);
    earth.rotation.y = 0;
    tick(performance.now());
    expect(pin.visible).toBe(true);
    cleanPins?.();
  });
  it('selects a globe marker on click but not after orbit dragging', async () => {
    harness.ready = true;
    const select = vi.fn();
    mount(null, null, { mapEvents: [{ id: 'real-event', latitude: 0, longitude: 0, title: 'Real event', date: '313 AD' }], onSelectEvent: select });
    const listeners: Record<string, (event: { clientX: number; clientY: number }) => void> = {};
    harness.refs[1].current = { addEventListener: (name: string, callback: typeof listeners[string]) => { listeners[name] = callback; }, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) };
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    // The renderer mock does not update camera matrices like WebGLRenderer.
    (harness.render.mock.calls[0][1] as import('three').Camera).updateMatrixWorld(true);
    const tooltip = { hidden: true, textContent: '', offsetWidth: 100, offsetHeight: 32, style: { left: '', top: '' } };
    harness.refs[3].current = tooltip;
    const pinCleanup = harness.effects[3]();
    const tick = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    tick(performance.now());
    listeners.pointermove({ clientX: 480, clientY: 270 });
    expect(tooltip.textContent).toBe('Real event\n313 AD');
    expect(tooltip.hidden).toBe(false);
    listeners.pointerdown({ clientX: 480, clientY: 270 });
    listeners.pointerup({ clientX: 500, clientY: 270 });
    expect(select).not.toHaveBeenCalled();
    listeners.pointerdown({ clientX: 480, clientY: 270 });
    listeners.pointerup({ clientX: 480, clientY: 270 });
    expect(select).toHaveBeenCalledWith('real-event');
    listeners.pointermove({ clientX: 480, clientY: 270 });
    const scene = harness.render.mock.calls[0][0] as import('three').Scene;
    scene.children[2].rotation.y = Math.PI;
    tick(performance.now());
    expect(tooltip.hidden).toBe(true);
    expect(scene.children[4].children[0].visible).toBe(false);
    pinCleanup?.();
  });
});

describe('country overlay lifecycle', () => {
  it('toggles only visibility and disposes the existing geometry/material on unmount', async () => {
    harness.ready = true;
    mount(null, null, { bordersVisible: false });
    await vi.waitFor(() => expect(harness.render).toHaveBeenCalled());
    const scene = harness.render.mock.calls[0][0] as import('three').Scene;
    const borders = scene.getObjectByName('CountryBorders') as import('three').LineSegments<import('three').BufferGeometry, import('three').LineBasicMaterial>;
    const geometry = borders.geometry;
    harness.effects[5]();
    expect(borders.visible).toBe(false);
    expect(borders.geometry).toBe(geometry);
    expect(harness.render).toHaveBeenCalledOnce();
    expect(harness.load).not.toHaveBeenCalled();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(borders.material, 'dispose');
    cleanup?.(); cleanup = undefined;
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
