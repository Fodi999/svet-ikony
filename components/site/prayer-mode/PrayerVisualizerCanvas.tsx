'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { PrayerParticleColorMode, PrayerSceneTimeline, PrayerSubtitleCue } from '@/lib/types';
import { buildAmbientParticles, buildParticlesFromImage, type ParticleField } from './buildParticlesFromImage';
import { particleFragmentShader, particleVertexShader } from './particleShaders';

type Props = {
  title: string;
  audioRef: RefObject<HTMLAudioElement | null>;
  getAnalyser: () => AnalyserNode | null;
  imageUrl: string;
  backgroundColor: string;
  particleCountDesktop: number;
  particleCountMobile: number;
  particleSize: number;
  particleColorMode: PrayerParticleColorMode;
  audioReactivity: number;
  sceneTimeline: PrayerSceneTimeline;
  subtitleCues: PrayerSubtitleCue[];
  /** Full prayer text, used to auto-generate subtitle lines when the admin
   * hasn't configured any explicit cues (see buildAutoSubtitleCues below). */
  prayerText: string;
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

function findCue(cues: PrayerSubtitleCue[], time: number): PrayerSubtitleCue | undefined {
  return cues.find((cue) => time >= cue.start && time < cue.end);
}

/**
 * The particle scene itself — canvas + current subtitle line, nothing else.
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
  particleCountDesktop,
  particleCountMobile,
  particleSize,
  particleColorMode,
  audioReactivity,
  sceneTimeline,
  subtitleCues,
  prayerText
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

  // The WebGL scene itself: set up once, torn down on unmount. Skipped
  // entirely for the no-WebGL2 / reduced-motion fallback (static image only).
  useEffect(() => {
    if (!webglReady) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;
    let renderer: import('three').WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let rafId = 0;

    void (async () => {
      const THREE = await import('three');

      const isMobile = window.innerWidth < 768;
      const maxCount = Math.max(1000, Math.round(isMobile ? particleCountMobile : particleCountDesktop));

      let field: ParticleField | null = null;
      if (imageUrl) {
        field = await buildParticlesFromImage(imageUrl, maxCount, particleColorMode);
      }
      if (!field) field = buildAmbientParticles(Math.min(maxCount, 6000), particleColorMode);
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

      let bgMesh: import('three').Mesh | null = null;
      let bgMaterial: import('three').MeshBasicMaterial | null = null;
      // Reuse the same CORS-safe blob: URL the particle sampler already
      // fetched, rather than the original remote URL — loading the original
      // URL again here could hit the browser's plain (non-CORS) <img> cache
      // entry for it (see loadImageCors in buildParticlesFromImage.ts).
      const textureSource = field.objectUrl || imageUrl;
      if (textureSource) {
        const texture = new THREE.TextureLoader().load(textureSource);
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
        uOrbit: { value: 0 }
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

      const ambientField = buildAmbientParticles(Math.min(isMobile ? 900 : 1800, Math.max(500, Math.round(maxCount * 0.08))), particleColorMode);
      const ambientGeometry = new THREE.BufferGeometry();
      const ambientPositions = ambientField.targets.slice();
      for (let i = 0; i < ambientField.count; i++) {
        const side = ambientField.randoms[i];
        const ringX = field.width * (side < 0.5 ? -0.64 : 0.64) + (Math.random() - 0.5) * field.width * 0.42;
        const ringY = (Math.random() - 0.5) * field.height * 1.22;
        ambientPositions[i * 3] = ringX;
        ambientPositions[i * 3 + 1] = ringY;
        ambientPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
      }
      ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions.slice(), 3));
      ambientGeometry.setAttribute('aStart', new THREE.BufferAttribute(ambientPositions, 3));
      ambientGeometry.setAttribute('aTarget', new THREE.BufferAttribute(ambientPositions, 3));
      ambientGeometry.setAttribute('aColor', new THREE.BufferAttribute(ambientField.colors, 3));
      ambientGeometry.setAttribute('aRandom', new THREE.BufferAttribute(ambientField.randoms, 1));

      const ambientUniforms = {
        uTime: { value: 0 },
        uProgress: { value: 1 },
        uDissolve: { value: 0 },
        uOpacity: { value: 0 },
        uAudioLevel: { value: 0 },
        uPointSize: { value: particleSize * 0.82 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uOrbit: { value: 1 }
      };
      const ambientMaterial = new THREE.ShaderMaterial({
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        uniforms: ambientUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ambientPoints = new THREE.Points(ambientGeometry, ambientMaterial);
      scene.add(ambientPoints);

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
        ambientUniforms.uTime.value = uniforms.uTime.value;
        ambientUniforms.uOpacity.value = Math.min(0.52, Math.max(0, progress - 0.35) * 0.9);
        if (bgMaterial) {
          const revealOpacity = progress >= 1 ? Math.min(0.34, Math.max(0, opacity - 0.5) * 0.72) : 0;
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

      rafId = requestAnimationFrame(tick);

      // Stash disposables on the effect closure for cleanup below.
      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        geometry.dispose();
        material.dispose();
        ambientGeometry.dispose();
        ambientMaterial.dispose();
        if (field.objectUrl) URL.revokeObjectURL(field.objectUrl);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglReady, imageUrl]);

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen();
  }

  return (
    <div className="prayer-visualizer-panel" ref={containerRef} style={{ background: backgroundColor || '#000000' }}>
      {!webglReady ? (
        <div className="prayer-mode-fallback">
          {imageUrl ? <img src={imageUrl} alt={title} /> : null}
        </div>
      ) : (
        <canvas ref={canvasRef} className="prayer-mode-canvas" />
      )}
      <p className="prayer-mode-subtitle" ref={subtitleRef} />
      <button type="button" className="prayer-visualizer-fullscreen" onClick={toggleFullscreen} aria-label="Повний екран">
        {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}
