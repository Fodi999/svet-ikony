import metadata from './country-metadata.json';
import type { CountryData } from './country-borders';
export type LatLng = { latitude: number; longitude: number };
export type Position = [number, number];
export type CountryInfo = { code: string; iso2: string | null; iso3: string | null; name: Record<'uk'|'ru'|'en',string>; continent: string; capital: Record<'uk'|'ru'|'en',string> | null; representative: number[] };
export const countryMetadata: Record<string,CountryInfo> = metadata;
export type CountryPolygon = { rings: Position[][]; bbox: [number,number,number,number]; area: number };
export type Country = { info: CountryInfo; polygons: CountryPolygon[]; point: LatLng; angularExtent: number; feature: CountryData['features'][number] };
export type CountryIndex = { countries: Country[]; byCode: Map<string,Country> };
const indexes = new WeakMap<CountryData,CountryIndex>();
export const normalizeLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
export function unwrapRing(ring: number[][]): Position[] {
  const result: Position[] = [];
  for (const [lon,lat] of ring) {
    let x = lon;
    if (result.length) x += 360 * Math.round((result.at(-1)![0] - x) / 360);
    result.push([x,lat]);
  }
  return result;
}
function ringContains(ring: Position[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax,ay] = ring[i], [bx,by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx-ax)*(y-ay)/(by-ay)+ax) inside = !inside;
  }
  return inside;
}
export function polygonContains(p: CountryPolygon, lat: number, lon: number): boolean {
  const [west,south,east,north] = p.bbox;
  const x = lon + 360 * Math.round(((west+east)/2-lon)/360);
  return lat >= south && lat <= north && x >= west && x <= east && ringContains(p.rings[0],x,lat) && !p.rings.slice(1).some(r => ringContains(r,x,lat));
}
export function prepareCountryIndex(data: CountryData): CountryIndex {
  const cached = indexes.get(data); if (cached) return cached;
  const countries: Country[] = [];
  for (const feature of data.features) {
    const info = countryMetadata[feature.properties?.code ?? '']; if (!info) continue;
    const raw = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const polygons = raw.map(rings => {
      const outer = unwrapRing(rings[0]);
      const xs = outer.map(p=>p[0]), ys = outer.map(p=>p[1]);
      const bbox: CountryPolygon['bbox'] = [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      const center = (bbox[0]+bbox[2])/2;
      const holes = rings.slice(1).map(r => { const unwrapped = unwrapRing(r); const shift = 360 * Math.round((center-unwrapped[0][0])/360); return unwrapped.map(([x,y])=>[x+shift,y] as Position); });
      const area = Math.abs(outer.reduce((sum,p,i)=>{const next=outer[(i+1)%outer.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
      return {rings:[outer,...holes],bbox,area};
    });
    const main = [...polygons].sort((a,b)=>b.area-a.area)[0];
    let [longitude,latitude] = info.representative;
    if (!polygons.some(p=>polygonContains(p,latitude,longitude))) {
      // An interior scanline point, not a bbox centroid that may land in water.
      latitude = (main.bbox[1]+main.bbox[3])/2;
      const intersections: number[] = [];
      for (const ring of main.rings) for (let i=1;i<ring.length;i++) {
        const a=ring[i-1], b=ring[i];
        if ((a[1]>latitude)!==(b[1]>latitude)) intersections.push(a[0]+(latitude-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      intersections.sort((a,b)=>a-b);
      let width = -1;
      for(let i=1;i<intersections.length;i+=2) if(intersections[i]-intersections[i-1]>width){width=intersections[i]-intersections[i-1];longitude=(intersections[i]+intersections[i-1])/2;}
    }
    const angularExtent = Math.max(main.bbox[3]-main.bbox[1],(main.bbox[2]-main.bbox[0])*Math.cos(latitude*Math.PI/180));
    countries.push({info,polygons,feature,point:{latitude,longitude:normalizeLongitude(longitude)},angularExtent});
  }
  const index = {countries,byCode:new Map(countries.map(c=>[c.info.code,c]))}; indexes.set(data,index); return index;
}
export function getCountryAtLatLng(index: CountryIndex, latitude: number, longitude: number): Country | null {
  if (!Number.isFinite(latitude+longitude) || Math.abs(latitude)>90) return null;
  for (const country of index.countries) if(country.polygons.some(p=>polygonContains(p,latitude,longitude))) return country;
  return null;
}
/** Future D1 seam. No country_code exists yet; null counts mean unavailable,
 * rather than inventing historical content or pretending a query was run. */
export function getCountryContent(countryCode: string) {
  return {countryCode,available:false as const,eventsCount:null,saintsCount:null,churchesCount:null,history:null,events:[]};
}
export function countryFlag(iso2: string | null) { return iso2?.length===2 ? [...iso2].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join('') : ''; }
