import * as THREE from 'three';
import { latLngToVector3 } from './geography';
import { countryMetadata } from './countries';

export type CapitalCity = {
  id: string; countryIso2: string; countryName: string; name: string; nameLocal: string;
  names: Partial<Record<'uk' | 'ru' | 'en', string>>; lat: number; lon: number;
  featureClass: string; scalerank: number; population: number; source: string;
};
type Locale = 'uk' | 'ru' | 'en';
export const isCapital = (city: CapitalCity) => ['Admin-0 capital','Admin-0 capital alt'].includes(city.featureClass);
export function parseCities(data: unknown): CapitalCity[] {
  const cities = (data as {cities?: CapitalCity[]})?.cities;
  const classes = ['Admin-1 capital','Admin-1 region capital','Admin-0 region capital','Populated place','Populated Place'];
  if (!Array.isArray(cities) || cities.some(c=>!c || typeof c.id!=='string' || typeof c.name!=='string' || !c.names || !Number.isFinite(c.lat) || Math.abs(c.lat)>90 || !Number.isFinite(c.lon) || Math.abs(c.lon)>180 || !classes.includes(c.featureClass))) throw new Error('Invalid city dataset');
  return cities;
}
export function cityRankLimit(altitude: number) {
  return altitude > 200000 ? -1 : altitude > 80000 ? 4 : altitude > 25000 ? 7 : 10;
}
export function parseCapitals(data: unknown): CapitalCity[] {
  const cities = (data as { capitals?: CapitalCity[] })?.capitals;
  if (!Array.isArray(cities) || cities.some(c => !c || typeof c.id!=='string' || typeof c.name!=='string' || !c.names || !Number.isFinite(c.lat) || Math.abs(c.lat)>90 || !Number.isFinite(c.lon) || Math.abs(c.lon)>180 || !['Admin-0 capital','Admin-0 capital alt'].includes(c.featureClass))) throw new Error('Invalid capital dataset');
  return cities;
}
export const capitalName = (city: CapitalCity, locale: Locale) => city.names[locale] || city.name;
export const capitalCountry = (city: CapitalCity, locale: Locale) => countryMetadata[city.countryIso2]?.name[locale] || city.countryName;
export function capitalSize(altitudeMeters: number) {
  return 4 + THREE.MathUtils.smoothstep(Math.sqrt(Math.max(0, altitudeMeters)), 100, 4000);
}
export function capitalPosition(city: Pick<CapitalCity, 'lat' | 'lon'>, radius: number, elevation: number | null) {
  return latLngToVector3(city.lat, city.lon, radius * (1 + ((elevation ?? 0) + 30) / 6371000));
}
export type LabelBox = { id: string; x: number; y: number; width: number; height: number };
export function collisionFreeLabels(boxes: LabelBox[], previous: Set<string>) {
  const accepted: LabelBox[] = [];
  for (const box of boxes) {
    const pad = previous.has(box.id) ? 3 : 9;
    if (accepted.some(other => box.x < other.x + other.width + pad && box.x + box.width + pad > other.x && box.y < other.y + other.height + pad && box.y + box.height + pad > other.y)) continue;
    accepted.push(box);
  }
  return accepted;
}

export function createCapitalCitiesLayer(ctx: {
  cities: CapitalCity[]; frame: THREE.Group; borders: THREE.LineSegments; canvas: HTMLCanvasElement;
  labels: HTMLElement; camera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera;
  locale: () => Locale; enabled: () => boolean; available: () => boolean;
  citiesEnabled?: () => boolean;
  elevation: (lat: number, lon: number) => number | null;
  terrain: () => THREE.Object3D | null; onSelect: (city: CapitalCity) => void;
}) {
  const cities = [...ctx.cities].sort((a,b) => Number(isCapital(b))-Number(isCapital(a)) || a.scalerank - b.scalerank || b.population - a.population || a.id.localeCompare(b.id));
  const positions = new Float32Array(cities.length * 3), visibility = new Float32Array(cities.length), active = new Float32Array(cities.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('shown', new THREE.BufferAttribute(visibility, 1));
  geometry.setAttribute('emphasis', new THREE.BufferAttribute(active, 1));
  geometry.setAttribute('cityTier',new THREE.Float32BufferAttribute(cities.map(c=>isCapital(c)?0:1),1));
  const material = new THREE.ShaderMaterial({
    uniforms: { size: { value: 8 }, dpr: { value: 1 } }, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
    vertexShader: `attribute float shown; attribute float emphasis; attribute float cityTier; uniform float size; uniform float dpr;
      varying float visiblePoint; varying float highlight; varying float tier;
      void main(){ visiblePoint=shown; highlight=emphasis; tier=cityTier; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=(mix(size,3.0,cityTier)+4.0)*dpr; }`,
    fragmentShader: `varying float visiblePoint; varying float highlight; varying float tier; uniform float size;
      void main(){ if(visiblePoint<0.5) discard;
        float d=mix(abs(gl_PointCoord.x-0.5)+abs(gl_PointCoord.y-0.5),length(gl_PointCoord-0.5),tier);
        float pointSize=mix(size,3.0,tier);
        float edge=0.5*pointSize/(pointSize+4.0);
        float shape=1.0-smoothstep(edge-0.035,edge+0.015,d);
        float ring=smoothstep(edge-0.12,edge-0.065,d);
        float halo=(1.0-smoothstep(edge,0.62,d))*highlight*0.22;
        vec3 color=mix(vec3(0.06,0.08,0.09),mix(vec3(0.96,0.83,0.54),vec3(0.9),tier),ring);
        gl_FragColor=vec4(color,max(shape,halo)); if(gl_FragColor.a<0.01)discard;
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'CapitalCitiesLayer'; points.frustumCulled = false; points.renderOrder = 8;
  ctx.frame.add(points);
  const labels = new Map<string, HTMLButtonElement>(), widths = new Map<string, number>();
  const measure = document.createElement('canvas').getContext('2d');
  let previous = new Set<string>(), hovered = -1, selected = -1, lastLayout = -Infinity, lastLocale = ctx.locale();
  let candidates: { index: number; x: number; y: number; eligible: boolean }[] = [];
  const world = new THREE.Vector3(), center = new THREE.Vector3(), normal = new THREE.Vector3(), view = new THREE.Vector3(), projected = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const terrainBounds = new THREE.Box3(), terrainSphere = new THREE.Sphere();
  const setHover = (index: number) => { hovered = index; };
  const select = (index: number) => { selected = index; ctx.onSelect(cities[index]); };
  const hit = (event: PointerEvent) => {
    const rect = ctx.canvas.getBoundingClientRect();
    return candidates.find(c => Math.hypot(c.x - (event.clientX - rect.left), c.y - (event.clientY - rect.top)) < 9)?.index ?? -1;
  };
  const move = (event: PointerEvent) => { if (!event.buttons) setHover(hit(event)); };
  const leave = () => setHover(-1);
  let down: { index: number; x: number; y: number } | null = null;
  const pointerDown = (event: PointerEvent) => { const index = hit(event); down = index < 0 ? null : { index, x: event.clientX, y: event.clientY }; };
  const pointerUp = (event: PointerEvent) => {
    if (down && hit(event) === down.index && Math.hypot(event.clientX-down.x,event.clientY-down.y)<5) {
      event.preventDefault(); select(down.index);
    }
    down = null;
  };
  ctx.canvas.addEventListener('pointermove', move, true);
  ctx.canvas.addEventListener('pointerleave', leave);
  ctx.canvas.addEventListener('pointerdown', pointerDown, true);
  ctx.canvas.addEventListener('pointerup', pointerUp, true);
  function tick(now: number) {
    const enabled = (ctx.enabled() || (ctx.citiesEnabled?.() ?? false)) && ctx.available();
    points.visible = enabled; ctx.labels.hidden = !enabled;
    if (!enabled) { candidates = []; return; }
    const camera = ctx.camera(), rect = ctx.canvas.getBoundingClientRect(), locale = ctx.locale();
    ctx.frame.updateWorldMatrix(true, false); camera.updateMatrixWorld();
    center.copy(ctx.borders.position).applyMatrix4(ctx.frame.matrixWorld);
    const radius = Number(ctx.borders.userData.earthRadius) || 1.8;
    const scale = ctx.frame.getWorldScale(new THREE.Vector3()).x;
    let altitude = Math.max(0, camera.position.distanceTo(center)/(radius*scale)-1)*6371000;
    if (camera instanceof THREE.OrthographicCamera) altitude /= Math.max(1, camera.zoom);
    const size = capitalSize(altitude);
    material.uniforms.size.value = size;
    material.uniforms.dpr.value = ctx.canvas.width / Math.max(1, rect.width);
    const rankLimit = altitude>5000000?2:altitude>1000000?4:10;
    const terrain = ctx.terrain();
    if(terrain)terrainBounds.setFromObject(terrain).getBoundingSphere(terrainSphere);
    candidates = [];
    for (let i=0; i<cities.length; i++) {
      const city = cities[i];
      const capital = isCapital(city);
      const eligible = capital ? ctx.enabled() && city.scalerank<=rankLimit : (ctx.citiesEnabled?.() ?? false) && city.scalerank<=cityRankLimit(altitude);
      if (!eligible) { visibility[i]=0; active[i]=0; continue; }
      // Reject off-screen places before DEM sampling and terrain raycasts.
      world.copy(capitalPosition(city,radius,null)).add(ctx.borders.position).applyMatrix4(ctx.frame.matrixWorld);
      projected.copy(world).project(camera);
      normal.copy(world).sub(center);
      if (camera instanceof THREE.OrthographicCamera) camera.getWorldDirection(view).negate();
      else view.copy(camera.position).sub(world);
      if (normal.dot(view)<0 || Math.abs(projected.x)>1.1 || Math.abs(projected.y)>1.1) { visibility[i]=0; active[i]=0; continue; }
      const local = capitalPosition(city,radius,ctx.elevation(city.lat,city.lon)).add(ctx.borders.position);
      local.toArray(positions,i*3); world.copy(local).applyMatrix4(ctx.frame.matrixWorld);
      normal.copy(world).sub(center);
      if (camera instanceof THREE.OrthographicCamera) camera.getWorldDirection(view).negate();
      else view.copy(camera.position).sub(world);
      projected.copy(world).project(camera);
      let visible = normal.dot(view)>0 && projected.z>=-1 && projected.z<=1 && Math.abs(projected.x)<1 && Math.abs(projected.y)<1;
      // DOM labels use the same occlusion as GPU markers, including mountain ridges.
      if (visible && terrain) {
        ray.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
        const distance = world.distanceTo(ray.ray.origin);
        ray.far = Math.max(0,distance-radius*2/6371000);
        visible = !ray.ray.intersectsSphere(terrainSphere) || !ray.intersectObject(terrain,true).some(h => {
          for(let node: THREE.Object3D | null=h.object;node;node=node.parent)if(!node.visible)return false;
          return true;
        });
      }
      visibility[i] = visible ? 1 : 0; active[i] = i===hovered || i===selected ? 1 : 0;
      if (visible) candidates.push({ index:i, x:(projected.x+1)*rect.width/2, y:(1-projected.y)*rect.height/2,
        eligible:true });
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.shown.needsUpdate = true; geometry.attributes.emphasis.needsUpdate = true;
    if (locale!==lastLocale) { widths.clear(); lastLocale=locale; lastLayout=-Infinity; }
    if (now!==lastLayout) {
      lastLayout=now;
      const boxes = candidates.filter(c=>c.eligible).map(c=>{
        const city=cities[c.index], name=capitalName(city,locale), fontSize=isCapital(city)?13:11, key=`${locale}:${fontSize}:${name}`;
        if (!widths.has(key)) { if(measure)measure.font=`${fontSize}px Arial`; widths.set(key,(measure?.measureText(name).width??name.length*8)+8); }
        return {id:city.id,x:c.x+size/2+5,y:c.y-9,width:widths.get(key)!,height:18};
      }).filter(b=>b.x+b.width<rect.width-4 && b.y>4 && b.y+b.height<rect.height-4);
      const countries = [...(ctx.labels.parentElement?.querySelectorAll<HTMLElement>('[data-country-labels] span') ?? [])].filter(el=>el.style.display!=='none' && !el.parentElement?.hidden).map(el=>el.getBoundingClientRect()).filter(b=>b.width>0);
      previous=new Set(collisionFreeLabels(boxes.filter(b=>!countries.some(c=>b.x<c.right-rect.left+10 && b.x+b.width>c.left-rect.left-10 && b.y<c.bottom-rect.top+8 && b.y+b.height>c.top-rect.top-8)),previous).map(b=>b.id));
    }
    const current = new Set<string>();
    for (const c of candidates) {
      const city=cities[c.index]; if(!previous.has(city.id)||!c.eligible)continue;
      current.add(city.id);
      let label=labels.get(city.id);
      if(!label) {
        label=document.createElement('button'); label.type='button'; label.className='capital-city-label';
        label.dataset.capitalId=city.id;
        label.dataset.placeTier=isCapital(city)?'capital':'city';
        label.onpointerenter=()=>setHover(c.index); label.onpointerleave=leave;
        label.onclick=event=>{event.stopPropagation();select(c.index);};
        ctx.labels.appendChild(label); labels.set(city.id,label);
      }
      const text=capitalName(city,locale);
      if(label.textContent!==text){label.textContent=text;label.setAttribute('aria-label',`${text}, ${capitalCountry(city,locale)}`);}
      label.style.transform=`translate(${c.x+size/2+5}px,${c.y-9}px)`;
      label.style.fontSize=isCapital(city)?'13px':'11px'; label.dataset.active=String(c.index===hovered||c.index===selected);
    }
    for(const [id,label] of labels)if(!current.has(id)){label.remove();labels.delete(id);}
    ctx.labels.dataset.visibleMarkers=String(candidates.length);
    ctx.labels.dataset.visibleLabels=String(labels.size);
    ctx.labels.dataset.markerSize=size.toFixed(2);
  }
  return { tick, dispose() {
    ctx.canvas.removeEventListener('pointermove',move,true);ctx.canvas.removeEventListener('pointerleave',leave);
    ctx.canvas.removeEventListener('pointerdown',pointerDown,true);ctx.canvas.removeEventListener('pointerup',pointerUp,true);
    labels.forEach(label=>label.remove());points.removeFromParent();geometry.dispose();material.dispose();
  } };
}
