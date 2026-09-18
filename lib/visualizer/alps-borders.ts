import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { alpsPointFactory, EARTH_METERS } from './alps-spherical';
import type { AlpsStream } from './alps-stream';

type Geo = [number, number];
export const ALPS_BORDER_OFFSET_METERS = 30;
export const ALPS_BORDER_SAMPLE_METERS = 50;
export const ALPS_BORDER_WIDTH_PX = 3;
export const ALPS_BORDER_OUTLINE_PX = 5.5;

function borderMaterial(color: THREE.ColorRepresentation, width: number) {
  const material = new LineMaterial({ color, linewidth: width, worldUnits: false,
    transparent: true, opacity: 1, depthTest: true, depthWrite: false, toneMapped: false });
  // Preserve the DEM-edge fade on both screen-space strokes.
  material.vertexShader = material.vertexShader.replace('void main() {',
    'attribute vec2 borderAlpha; varying float vBorderAlpha;\nvoid main() {\nvBorderAlpha = position.y < 0.5 ? borderAlpha.x : borderAlpha.y;');
  material.fragmentShader = material.fragmentShader.replace('void main() {',
    'varying float vBorderAlpha;\nvoid main() {').replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );',
    'gl_FragColor = vec4( diffuseColor.rgb, alpha * vBorderAlpha );');
  return material;
}
// The bridge is outside the DEM: never lift the mountain border to the globe shell.
export const ALPS_BORDER_TRANSITION_METERS = 20000;
const BOUNDS = { west: 6.7, east: 6.98, south: 45.75, north: 45.95 };
const METERS_PER_DEGREE = Math.PI * EARTH_METERS / 180;

function outsideDistance(lat: number, lon: number, bounds=BOUNDS) {
  return METERS_PER_DEGREE * Math.hypot(lat - THREE.MathUtils.clamp(lat, bounds.south, bounds.north), (lon - THREE.MathUtils.clamp(lon, bounds.west, bounds.east)) * Math.cos(lat * Math.PI / 180));
}

export function clipAlpsSegment(a: Geo, b: Geo, paddingMeters = 0, bounds=BOUNDS): [number, number] | null {
  let lo = 0, hi = 1;
  const latPad = paddingMeters / METERS_PER_DEGREE;
  const lonPad = latPad / Math.cos(bounds.north * Math.PI / 180);
  for (const [axis, min, max] of [[0, bounds.west - lonPad, bounds.east + lonPad], [1, bounds.south - latPad, bounds.north + latPad]]) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) { if (a[axis] < min || a[axis] > max) return null; continue; }
    const t0 = (min - a[axis]) / d, t1 = (max - a[axis]) / d;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
  }
  return hi > lo ? [lo, hi] : null;
}

export function alpsBorderSample(lat: number, lon: number, globeHeight: number, heightAt: (lat: number, lon: number) => number | null,bounds=BOUNDS) {
  const sampleLat = THREE.MathUtils.clamp(lat, bounds.south, bounds.north);
  const sampleLon = THREE.MathUtils.clamp(lon, bounds.west, bounds.east);
  const distance = outsideDistance(lat, lon,bounds);
  const t = THREE.MathUtils.clamp(distance / ALPS_BORDER_TRANSITION_METERS, 0, 1);
  if (t === 1) return globeHeight;
  const elevation = heightAt(sampleLat, sampleLon);
  if (elevation === null || !Number.isFinite(elevation)) return null;
  return THREE.MathUtils.lerp(elevation + ALPS_BORDER_OFFSET_METERS, globeHeight, t * t * (3 - 2 * t));
}

type Sample = { lat: number; lon: number; globeHeight: number };
type BorderRecord = {
  source: THREE.LineSegments;
  original: THREE.BufferGeometry;
  outside: THREE.BufferGeometry;
  line: LineSegments2;
  outline: LineSegments2;
  samples: Sample[];
  replacedSegments: number;
  revision: string | null;
  close: boolean | null;
};

export class AlpsBorders {
  private records = new Map<THREE.LineSegments, BorderRecord>();
  private checked = new WeakMap<THREE.LineSegments, THREE.BufferGeometry>();
  private hidden = new Map<THREE.Object3D, boolean>();
  private hiddenMaterials = new Map<THREE.Material, boolean>();
  private active = false;
  constructor(private frame: THREE.Group, private borders: THREE.LineSegments, private stream: AlpsStream, private radius: number) {}
  private get bounds(){const b=this.stream.manifest.bounds as {minLon:number;maxLon:number;minLat:number;maxLat:number};return {west:b.minLon,east:b.maxLon,south:b.minLat,north:b.maxLat};}

  private register(source: THREE.LineSegments) {
    const existing = this.records.get(source);
    if (existing && (source.geometry === existing.original || source.geometry === existing.outside)) return;
    if (existing) this.release(existing, false);
    if (this.checked.get(source) === source.geometry) return;
    const original = source.geometry, p = original.getAttribute('position');
    if (!p?.count) return;
    this.checked.set(source, original);
    const outside: number[] = [], samples: Sample[] = [];
    const toFrame = this.frame.matrixWorld.clone().invert().multiply(source.matrixWorld);
    const point = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(toFrame).sub(this.borders.position);
    const geo = (v: THREE.Vector3): Geo => [THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z)), THREE.MathUtils.radToDeg(Math.asin(v.y / v.length()))];
    let replacedSegments = 0;
    for (let i = 0; i < p.count; i += 2) {
      const a = point(i), b = point(i + 1), ag = geo(a), bg = geo(b);
      // The extra margin conservatively covers curvature of the original chord.
      if (!clipAlpsSegment(ag, bg, ALPS_BORDER_TRANSITION_METERS + 1000,this.bounds)) {
        for (const j of [i, i + 1]) outside.push(p.getX(j), p.getY(j), p.getZ(j));
        continue;
      }
      replacedSegments++;
      const steps = Math.max(1, Math.ceil(a.angleTo(b) * EARTH_METERS / ALPS_BORDER_SAMPLE_METERS));
      for (let k = 0; k < steps; k++) for (const t of [k / steps, (k + 1) / steps]) {
        // Follow the original geographic arc and match its endpoints exactly.
        const v = a.clone().lerp(b, t), [lon, lat] = geo(v);
        samples.push({ lat, lon, globeHeight: (v.length() / this.radius - 1) * EARTH_METERS });
      }
    }
    if (!samples.length) return;
    const replacement = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(outside, 3));
    replacement.computeBoundingSphere();
    const geometry = new LineSegmentsGeometry().setPositions(new Float32Array(samples.length * 3));
    geometry.setAttribute('borderAlpha', new THREE.InstancedBufferAttribute(new Float32Array(samples.length).fill(1), 2));
    const line = new LineSegments2(geometry, borderMaterial(0xffda79, ALPS_BORDER_WIDTH_PX));
    const outline = new LineSegments2(geometry, borderMaterial(0x171b1d, ALPS_BORDER_OUTLINE_PX));
    line.name = 'AlpsDrapedBorder'; outline.name = 'AlpsDrapedBorderOutline';
    for (const stroke of [line, outline]) { stroke.frustumCulled = false; stroke.visible = false; }
    line.renderOrder = 3; outline.renderOrder = 2;
    this.stream.root.add(outline, line);
    this.records.set(source, { source, original, outside: replacement, line, outline, samples, replacedSegments, revision: null, close: null });
  }

  private visibleInFrame(node: THREE.Object3D) {
    let current: THREE.Object3D | null = node;
    while (current && current !== this.frame) { if (!current.visible) return false; current = current.parent; }
    return current === this.frame && this.frame.visible;
  }

  update(active: boolean, close: boolean) {
    this.active = active;
    if (!active) { this.restore(); return; }
    if (!close) this.restoreMaterials();
    this.frame.updateWorldMatrix(true, true);
    this.register(this.borders);
    this.frame.traverse(group => {
      if (!/^CountryHighlight:/.test(group.name)) return;
      for (const child of group.children) {
        if (child instanceof THREE.LineSegments) {
          this.register(child);
          if (close) {
            const material = child.material as THREE.Material;
            if (!this.hiddenMaterials.has(material)) this.hiddenMaterials.set(material, material.visible);
            material.visible = false;
          }
        }
        else if (child instanceof THREE.Mesh) {
          if (close) { if (!this.hidden.has(child)) this.hidden.set(child, child.visible); child.visible = false; }
          else if (this.hidden.has(child)) { child.visible = this.hidden.get(child)!; this.hidden.delete(child); }
        }
      }
    });
    const point = alpsPointFactory(this.stream.manifest, this.radius), revision = this.stream.surfaceRevision;
    for (const record of this.records.values()) {
      record.line.visible = record.outline.visible = this.visibleInFrame(record.source);
      const sourceMaterial = record.source.material as THREE.LineBasicMaterial;
      record.line.material.opacity = close && sourceMaterial.opacity > 0 ? 1 : sourceMaterial.opacity;
      record.outline.material.opacity = record.line.material.opacity;
      record.line.material.visible = record.outline.material.visible = this.hiddenMaterials.get(sourceMaterial) ?? sourceMaterial.visible;
      if (close) {
        if (!this.hiddenMaterials.has(sourceMaterial)) this.hiddenMaterials.set(sourceMaterial, sourceMaterial.visible);
        sourceMaterial.visible = false;
      }
      if (record.close !== close) {
        const colors = record.line.geometry.getAttribute('borderAlpha') as THREE.BufferAttribute;
        record.samples.forEach((sample, i) => {
          // Without outside DEM, do not present the globe's elevated shell as local terrain.
          const t = close ? THREE.MathUtils.clamp(outsideDistance(sample.lat, sample.lon,this.bounds) / 500, 0, 1) : 0;
          colors.array[i] = 1 - t * t * (3 - 2 * t);
        });
        colors.needsUpdate = true; record.close = close;
      }
      if (record.revision !== revision) {
        const values: number[] = [];
        for (const sample of record.samples) {
          const height = alpsBorderSample(sample.lat, sample.lon, sample.globeHeight, (lat, lon) => this.stream.renderHeightAt(lat, lon),this.bounds);
          if (height === null) break;
          values.push(...point(sample.lat, sample.lon, height).toArray());
        }
        // Never show an elevated original and its replacement together, even while loading.
        record.source.geometry = record.outside;
        if (values.length !== record.samples.length * 3) { record.line.visible = record.outline.visible = false; continue; }
        const p = record.line.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
        p.data.array.set(values); p.data.needsUpdate = true; record.revision = revision;
      }
      record.source.geometry = record.outside;
    }
  }

  audit() {
    return {
      active: this.active,
      globalSegmentsReplaced: [...this.records.values()].reduce((n, r) => n + r.replacedSegments, 0),
      originalsHidden: this.active && [...this.records.values()].every(r => r.source.geometry === r.outside),
      sampleStepMeters: ALPS_BORDER_SAMPLE_METERS, clearanceMeters: ALPS_BORDER_OFFSET_METERS,
      widthPixels: ALPS_BORDER_WIDTH_PX, outlinePixels: ALPS_BORDER_OUTLINE_PX,
      visibleLocalLayers: [...this.records.values()].filter(r => r.line.visible).length,
      globalLayersSuppressedForCloseView: this.hiddenMaterials.size,
    };
  }

  private restore() {
    this.restoreMaterials();
    for (const r of this.records.values()) { r.source.geometry = r.original; r.line.visible = r.outline.visible = false; }
    for (const [node, visible] of this.hidden) node.visible = visible;
    this.hidden.clear();
  }
  private restoreMaterials() {
    for (const [material, visible] of this.hiddenMaterials) material.visible = visible;
    this.hiddenMaterials.clear();
  }
  private release(r: BorderRecord, restore: boolean) {
    if (restore && r.source.geometry === r.outside) r.source.geometry = r.original;
    r.outside.dispose(); r.line.geometry.dispose(); r.line.material.dispose(); r.line.removeFromParent();
    r.outline.material.dispose(); r.outline.removeFromParent();
    this.records.delete(r.source);
  }
  dispose() { this.restore(); for (const r of this.records.values()) this.release(r, true); }
}
