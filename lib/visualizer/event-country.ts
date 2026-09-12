import { getCountryAtLatLng, type Country, type CountryIndex, type Position } from './countries';

const EARTH_KM = 6371.0088;
const RAD = Math.PI / 180;
// Istanbul misses the 50m coastline by 1.622 km. Keep the correction local:
// 3km allows modest simplification error without selecting distant islands.
export const EVENT_COUNTRY_MAX_DISTANCE_KM = 3;
export const EVENT_COUNTRY_MIN_GAP_KM = 2;
type Vector = [number, number, number];
const dot = (a: Vector, b: Vector) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Vector, b: Vector): Vector => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angle = (a: Vector, b: Vector) => Math.atan2(Math.hypot(...cross(a,b)), dot(a,b));
function unit([lon,lat]: Position): Vector {
  const c = Math.cos(lat*RAD);
  return [c*Math.cos(lon*RAD), c*Math.sin(lon*RAD), Math.sin(lat*RAD)];
}
/** Shortest spherical distance to the minor great-circle segment, including
 * endpoints. Unit vectors handle antimeridian crossings without longitude jumps. */
export function distanceToBoundarySegmentKm(point: Position, start: Position, end: Position): number {
  const p=unit(point), a=unit(start), b=unit(end);
  const normal=cross(a,b), norm=Math.hypot(...normal);
  const endpoints=Math.min(angle(p,a),angle(p,b));
  if(norm<1e-12) return endpoints*EARTH_KM;
  const n=normal.map(v=>v/norm) as Vector;
  const projection=p.map((v,i)=>v-dot(p,n)*n[i]) as Vector;
  const length=Math.hypot(...projection);
  if(length<1e-12) return endpoints*EARTH_KM;
  const q=projection.map(v=>v/length) as Vector;
  return (angle(a,q)+angle(q,b)<=angle(a,b)+1e-10 ? angle(p,q) : endpoints)*EARTH_KM;
}
/** All components and hole boundaries participate; input geometry is never edited. */
export function distanceToCountryBoundaryKm(country: Country, latitude: number, longitude: number): number {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90) return Infinity;
  let minimum=Infinity;
  for(const polygon of country.polygons) for(const ring of polygon.rings) {
    for(let i=0;i<ring.length;i++) minimum=Math.min(minimum,distanceToBoundarySegmentKm([longitude,latitude],ring[i],ring[(i+1)%ring.length]));
  }
  return minimum;
}
/** Event-only correction. The ordinary mouse hit-test remains strict PIP.
 * Competing components of the same country count as one candidate. */
export function getNearestCountryAtLatLng(index: CountryIndex, latitude: number, longitude: number): Country|null {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90) return null;
  let nearest: Country|null=null, best=Infinity, second=Infinity;
  for(const country of index.countries){
    const distance=distanceToCountryBoundaryKm(country,latitude,longitude);
    if(distance<best){second=best;best=distance;nearest=country;}
    else second=Math.min(second,distance);
  }
  if(best>EVENT_COUNTRY_MAX_DISTANCE_KM || second-best<EVENT_COUNTRY_MIN_GAP_KM || second<best*2) return null;
  return nearest;
}
export function resolveEventCountry(index: CountryIndex, latitude: number, longitude: number): Country|null {
  return getCountryAtLatLng(index,latitude,longitude) ?? getNearestCountryAtLatLng(index,latitude,longitude);
}
