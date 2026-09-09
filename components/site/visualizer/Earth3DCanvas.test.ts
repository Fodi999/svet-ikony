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

function mount(baseEarthModelUrl: string | null, selectedEvent: import("./Earth3DCanvas").SelectedEventTarget = null) {
  Earth3DCanvas({ baseEarthModelUrl, selectedEvent });
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
