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
  particleSize: number;
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
  particleSize,
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

      const THREE = await import('three');
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

      let bgMesh: import('three').Mesh | null = null;
      let bgMaterial: import('three').MeshBasicMaterial | null = null;
      // The small backend-prepared fallback WebP doubles as this decorative
      // background wash — no client-side image fetch/CORS handling needed
      // since nothing here reads pixel data, only displays it.
      const rawTextureSource = visualizerAsset?.processingStatus === 'ready' ? visualizerAsset.fallbackImageUrl : '';
      // The plain fallback <img> (rendered below, same component) loads this
      // exact URL as a no-cors image. THREE.TextureLoader loads it with
      // crossOrigin, and the browser's HTTP cache is keyed by URL alone —
      // sharing the URL across both request modes can serve the crossorigin
      // load from the plain load's cached opaque response. A distinct query
      // suffix keeps them in separate cache entries (same fix already used
      // for the source-image sampler before this refactor removed it).
      const textureSource = rawTextureSource ? `${rawTextureSource}${rawTextureSource.includes('?') ? '&' : '?'}tex=1` : '';
      if (textureSource) {
        const texture = new THREE.TextureLoader().load(textureSource);
        // Explicit sRGB tag: an untagged texture defaults to "linear" in
        // recent Three versions, which — combined with outputColorSpace —
        // would otherwise apply an unwanted extra gamma pass to an already
        // display-ready (sRGB-encoded) photo and darken it further.
        texture.colorSpace = THREE.SRGBColorSpace;
        const bgGeometry = new THREE.PlaneGeometry(field.width * 1.05, field.height * 1.05);
        bgMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          color: new THREE.Color(0x7a6442),
          depthWrite: false
        });
        bgMaterial.blending = THREE.NormalBlending;
        bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
        bgMesh.position.z = -0.15;
        scene.add(bgMesh);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(field.starts.slice(), 3));
      geometry.setAttribute('aStart', new THREE.BufferAttribute(field.starts, 3));
      geometry.setAttribute('aTarget', new THREE.BufferAttribute(field.targets, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(field.colors, 3));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(field.randoms, 1));

      const uniforms = {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uDissolve: { value: 0 },
        uOpacity: { value: 0 },
        uAudioLevel: { value: 0 },
        uPointSize: { value: particleSize },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uOrbit: { value: 0 },
        // A custom ShaderMaterial writes gl_FragColor directly, so Three's
        // renderer.toneMappingExposure (which only affects materials built
        // from Three's own shader chunks) has no effect here — this uniform
        // is the actual exposure control for the particle system, a render-
        // time display setting, not a re-derivation of the backend's colors.
        uExposure: { value: 1.2 }
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

      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !container) return;
        const box = container.getBoundingClientRect();
        const nextAspect = (box.width || 1) / (box.height || 1);
        camera.left = -nextAspect;
        camera.right = nextAspect;
        camera.updateProjectionMatrix();
        renderer.setSize(box.width || 1, box.height || 1, false);
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
        if (bgMaterial) {
          const revealOpacity = progress >= 1 ? Math.min(0.42, Math.max(0, opacity - 0.5) * 0.84) : 0;
          bgMaterial.opacity = revealOpacity;
        }

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

        renderer.render(scene, camera);

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
        if (bgMesh) {
          bgMesh.geometry.dispose();
          bgMaterial?.map?.dispose();
          bgMaterial?.dispose();
        }
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
