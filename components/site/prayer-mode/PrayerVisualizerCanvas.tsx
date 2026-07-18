'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { PrayerSceneTimeline, PrayerSubtitleCue, PrayerVisualizerAssetDto } from '@/lib/types';
import { loadParticleMap } from './particleMapFormat';
import { particleFragmentShader, particleVertexShader } from './particleShaders';

type Props = {
  title: string;
  audioRef: RefObject<HTMLAudioElement | null>;
  getAnalyser: () => AnalyserNode | null;
  imageUrl: string;
  backgroundColor: string;
  audioReactivity: number;
  sceneTimeline: PrayerSceneTimeline;
  subtitleCues: PrayerSubtitleCue[];
  /** Full prayer text, used to auto-generate subtitle lines when the admin
   * hasn't configured any explicit cues (see buildAutoSubtitleCues below). */
  prayerText: string;
  /**
   * Backend-preprocessed particle maps — the ONLY source of particle data.
   * This component never samples `imageUrl` or generates particles itself;
   * when this isn't `ready`, it shows the static fallback image instead of
   * rendering a scene (see the render section below).
   */
  visualizerAsset?: PrayerVisualizerAssetDto | null;
};

/**
 * Splits the prayer's own text into subtitle-sized lines (by paragraph, then
 * by sentence for anything too long) and spreads them evenly across the
 * audio's duration. This is the fallback used whenever the admin hasn't
 * manually timed any subtitleCues — most prayers never will be, and the
 * text is already there, so titles should "just work" without extra setup.
 */
function splitIntoSubtitleLines(text: string): string[] {
  const paragraphs = text.split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 90) {
      lines.push(paragraph);
    } else {
      const sentences = paragraph.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
      lines.push(...(sentences.length ? sentences : [paragraph]));
    }
  }
  return lines;
}

function buildAutoSubtitleCues(text: string, duration: number): PrayerSubtitleCue[] {
  if (!text || !Number.isFinite(duration) || duration <= 0) return [];
  const lines = splitIntoSubtitleLines(text);
  if (!lines.length) return [];
  const perLine = duration / lines.length;
  return lines.map((line, index) => ({
    start: index * perLine,
    end: (index + 1) * perLine,
    text: line
  }));
}

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

/** Rough, best-effort "this device would struggle with 70k particles" check —
 * used only to pick the low-power prepared map tier; never blocks rendering. */
function isLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
  return false;
}

function findCue(cues: PrayerSubtitleCue[], time: number): PrayerSubtitleCue | undefined {
  return cues.find((cue) => time >= cue.start && time < cue.end);
}

/** Picks which prepared tier to download for this device. Returns '' if the
 * asset isn't ready or has no map for the picked tier. */
function pickMapUrl(asset: PrayerVisualizerAssetDto | null | undefined): string {
  if (!asset || asset.processingStatus !== 'ready') return '';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const lowPower = isLowPowerDevice();
  return (lowPower && asset.lowPowerMapUrl) || (isMobile && asset.mobileMapUrl) || asset.desktopMapUrl || '';
}

/**
 * Pure renderer: downloads the backend-prepared binary particle map for this
 * device tier, uploads it to the GPU as-is, and animates it (assemble →
 * reveal → hold → dissolve, audio-reactive size, subtitle sync). It never
 * decodes/samples the source photo, computes a color, or generates a
 * particle — all of that happens exactly once, server-side (see
 * `assistant/src/application/prayer_visualizer.rs`). If no `ready` map is
 * available yet (still processing, failed, or never configured), this shows
 * the plain fallback image instead of trying to render anything.
 *
 * Playback controls live in the page's single shared PrayerAudioBar; this
 * component only reads audioRef/getAnalyser to drive the animation, it never
 * writes to them.
 */
export function PrayerVisualizerCanvas({
  title,
  audioRef,
  getAnalyser,
  imageUrl,
  backgroundColor,
  audioReactivity,
  sceneTimeline,
  subtitleCues,
  prayerText,
  visualizerAsset
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const subtitleRef = useRef<HTMLParagraphElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Lazily built once the audio's real duration is known (see the tick loop),
  // and reused after that instead of recomputing every frame.
  const autoCuesRef = useRef<PrayerSubtitleCue[] | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  // Whether a prepared map has actually been downloaded and a scene built —
  // controls the canvas/fallback-image crossfade below.
  const [hasScene, setHasScene] = useState(false);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    setWebglReady(supportsWebGL2() && !prefersReducedMotion());
  }, []);

  const mapUrl = pickMapUrl(visualizerAsset);

  // The WebGL scene itself: set up once a prepared map is available, torn
  // down on unmount/change. Skipped entirely for no-WebGL2/reduced-motion,
  // and whenever there's no ready map — the fallback image covers both cases.
  useEffect(() => {
    if (!webglReady || !mapUrl) {
      setHasScene(false);
      return;
    }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;
    let renderer: import('three').WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let rafId = 0;

    void (async () => {
      const field = await loadParticleMap(mapUrl);
      if (disposed || !field) return;

      const [THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
        import('three'),
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js')
      ]);
      if (disposed) return;

      const scene = new THREE.Scene();
      const rect = container.getBoundingClientRect();
      const aspect = (rect.width || 1) / (rect.height || 1);
      const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
      camera.position.z = 2;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(rect.width || 1, rect.height || 1, false);
      renderer.setClearColor(new THREE.Color(backgroundColor || '#000000'), 1);
      // Explicit, version-independent defaults rather than relying on
      // whatever this Three.js build's defaults happen to be — our particle
      // aColor values are already "display-ready" (graded server-side, not
      // scene-referred linear light), so no tone-mapping curve should touch them.
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(field.starts.slice(), 3));
      geometry.setAttribute('aStart', new THREE.BufferAttribute(field.starts, 3));
      geometry.setAttribute('aTarget', new THREE.BufferAttribute(field.targets, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(field.colors, 3));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(field.randoms, 1));
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(field.alphas, 1));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(field.sizes, 1));
      geometry.setAttribute('aReveal', new THREE.BufferAttribute(field.reveal, 1));
      geometry.setAttribute('aShape', new THREE.BufferAttribute(field.shapes, 1));
      geometry.setAttribute('aAspect', new THREE.BufferAttribute(field.aspects, 1));
      geometry.setAttribute('aRotation', new THREE.BufferAttribute(field.rotations, 1));
      geometry.setAttribute('aSoftness', new THREE.BufferAttribute(field.softness, 1));
      geometry.setAttribute('aGlow', new THREE.BufferAttribute(field.glow, 1));

      const uniforms = {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uDissolve: { value: 0 },
        uOpacity: { value: 0 },
        uAudioLevel: { value: 0 },
        // Both baked into the PVM map server-side, derived from the source
        // image itself (particle density/detail → base size, mean luminance
        // → exposure) — never a manual admin setting.
        uPointSize: { value: field.basePointSize },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uOrbit: { value: 0 },
        // A custom ShaderMaterial writes gl_FragColor directly, so Three's
        // renderer.toneMappingExposure (which only affects materials built
        // from Three's own shader chunks) has no effect here — this uniform
        // is the actual exposure control for the particle system, a render-
        // time display setting, not a re-derivation of the backend's colors.
        uExposure: { value: field.autoExposure }
      };

      const material = new THREE.ShaderMaterial({
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      // Screen-space bloom: lets the brightest particles (baked-server-side
      // "glow" — highlight points, gilding, catchlights) physically bleed
      // light onto neighboring pixels instead of just being a brighter dot,
      // so the scene reads as genuinely lit rather than merely bright. The
      // threshold is tuned above the typical splat/streak brightness so
      // flat volume fill stays crisp and only real highlights bloom.
      //
      // UnrealBloomPass runs ~13 extra fullscreen passes (highpass extract +
      // 5 blur mip levels x2 directions + composite), which is effectively
      // free on any real GPU but is skipped entirely on devices already
      // flagged as low-power (see isLowPowerDevice — same signal used to
      // pick the low-power particle-map tier) so weak hardware falls back to
      // the plain, cheaper render path instead of a bloom that would fight
      // the device for frame time.
      const bloomEnabled = !isLowPowerDevice();
      // Bloom is a blurred effect by nature, so it doesn't need to match the
      // renderer's full (up to 2x) device pixel ratio — the composer is
      // deliberately capped at 1x, which cuts the blur passes' pixel count
      // by up to 4x on retina displays with no visible softness loss, since
      // UnrealBloomPass already downsamples internally for its blur mips.
      const composer = bloomEnabled ? new EffectComposer(renderer) : null;
      const bloomPass = bloomEnabled
        ? new UnrealBloomPass(new THREE.Vector2(rect.width || 1, rect.height || 1), 0.75, 0.55, 0.42)
        : null;
      if (composer && bloomPass) {
        composer.setPixelRatio(1);
        composer.setSize(rect.width || 1, rect.height || 1);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(bloomPass);
      }

      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !container) return;
        const box = container.getBoundingClientRect();
        const nextAspect = (box.width || 1) / (box.height || 1);
        camera.left = -nextAspect;
        camera.right = nextAspect;
        camera.updateProjectionMatrix();
        renderer.setSize(box.width || 1, box.height || 1, false);
        composer?.setSize(box.width || 1, box.height || 1);
        bloomPass?.setSize(box.width || 1, box.height || 1);
      });
      resizeObserver.observe(container);

      const analyserDataRef: { data: Uint8Array<ArrayBuffer> | null } = { data: null };
      let dissolveStart: number | null = null;
      const startTime = performance.now();

      function tick(now: number) {
        if (disposed || !renderer) return;
        uniforms.uTime.value = (now - startTime) / 1000;

        const audio = audioRef.current;
        const { idle, assemble, reveal, dissolve } = sceneTimeline;
        let progress = 0;
        let dissolveAmount = 0;
        let opacity = 0;

        if (audio?.ended) {
          if (dissolveStart === null) dissolveStart = now;
          const dissolveElapsed = now - dissolveStart;
          progress = 1;
          dissolveAmount = Math.min(1, dissolveElapsed / Math.max(1, dissolve));
          opacity = 1 - dissolveAmount;
        } else {
          dissolveStart = null;
          const audioTime = audio?.currentTime ?? 0;
          const t = audioTime > 0 ? audioTime * 1000 : now - startTime;
          if (t <= idle) {
            // "Slow field of dots": scattered and dim, not yet assembling.
            progress = 0;
            opacity = 0.35;
          } else if (t <= idle + assemble) {
            progress = (t - idle) / Math.max(1, assemble);
            opacity = 0.35 + 0.65 * progress;
          } else if (t <= idle + assemble + reveal) {
            progress = 1;
            const revealElapsed = t - idle - assemble;
            opacity = Math.min(1, 0.6 + 0.4 * (revealElapsed / Math.max(1, reveal)));
          } else {
            progress = 1;
            opacity = 1;
          }
        }

        uniforms.uProgress.value = progress;
        uniforms.uDissolve.value = dissolveAmount;
        uniforms.uOpacity.value = opacity;

        const analyser = getAnalyser();
        if (analyser) {
          if (!analyserDataRef.data || analyserDataRef.data.length !== analyser.frequencyBinCount) {
            analyserDataRef.data = new Uint8Array(analyser.frequencyBinCount);
          }
          analyser.getByteFrequencyData(analyserDataRef.data);
          let sum = 0;
          for (let i = 0; i < analyserDataRef.data.length; i++) sum += analyserDataRef.data[i];
          const avg = analyserDataRef.data.length ? sum / analyserDataRef.data.length / 255 : 0;
          uniforms.uAudioLevel.value = avg * audioReactivity;
        } else {
          uniforms.uAudioLevel.value = 0;
        }

        if (composer) composer.render();
        else renderer.render(scene, camera);

        if (audio) {
          if (!subtitleCues.length && !autoCuesRef.current && Number.isFinite(audio.duration) && audio.duration > 0) {
            autoCuesRef.current = buildAutoSubtitleCues(prayerText, audio.duration);
          }
          const effectiveCues = subtitleCues.length ? subtitleCues : (autoCuesRef.current || []);
          const cue = findCue(effectiveCues, audio.currentTime);
          if (subtitleRef.current) {
            const text = cue?.text || '';
            if (subtitleRef.current.textContent !== text) {
              subtitleRef.current.textContent = text;
              subtitleRef.current.style.opacity = text ? '1' : '0';
            }
          }
        }

        rafId = requestAnimationFrame(tick);
      }

      setHasScene(true);
      rafId = requestAnimationFrame(tick);

      // Stash disposables on the effect closure for cleanup below.
      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        geometry.dispose();
        material.dispose();
        bloomPass?.dispose();
        composer?.dispose();
        renderer?.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      setHasScene(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglReady, mapUrl]);

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen();
  }

  const fallbackSrc = (visualizerAsset?.processingStatus === 'ready' && visualizerAsset.fallbackImageUrl) || imageUrl;

  return (
    <div className="prayer-visualizer-panel" ref={containerRef} style={{ background: backgroundColor || '#000000' }}>
      {webglReady && mapUrl ? (
        <canvas ref={canvasRef} className="prayer-mode-canvas" style={{ visibility: hasScene ? 'visible' : 'hidden' }} />
      ) : null}
      {!hasScene ? (
        <div className="prayer-mode-fallback">
          {fallbackSrc ? <img src={fallbackSrc} alt={title} /> : null}
        </div>
      ) : null}
      <p className="prayer-mode-subtitle" ref={subtitleRef} />
      <button type="button" className="prayer-visualizer-fullscreen" onClick={toggleFullscreen} aria-label="Повний екран">
        {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}
