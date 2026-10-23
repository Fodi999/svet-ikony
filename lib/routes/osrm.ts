import {ApiError} from '@/lib/d1/errors';

/**
 * Road routing for "how to get there", through the public FOSSGIS OSRM
 * servers (OpenStreetMap data, no key, fair use). Only this module knows the
 * provider: swapping to a self-hosted OSRM or a paid service changes nothing
 * in the API route or the UI.
 */
export type TravelMode='car'|'foot';
export type LatLon={lat:number;lon:number};
export type Route={mode:TravelMode;distance:number;duration:number;coordinates:[number,number][]};

const ENDPOINT:Record<TravelMode,string>={car:'https://routing.openstreetmap.de/routed-car',foot:'https://routing.openstreetmap.de/routed-foot'};
export const ROUTE_ATTRIBUTION='© OpenStreetMap contributors · OSRM';

export function parseLatLon(value:string|null,name:string):LatLon {
  const parts=(value??'').split(',').map(Number);
  if(parts.length!==2||!parts.every(Number.isFinite)||Math.abs(parts[0])>90||Math.abs(parts[1])>180)throw ApiError.validation(`${name} must be "lat,lon"`);
  return {lat:parts[0],lon:parts[1]};
}
export function parseMode(value:string|null):TravelMode {
  if(value===null||value==='car')return 'car';
  if(value==='foot')return 'foot';
  throw ApiError.validation('mode must be car or foot');
}

/** Null when the network has no route between the points (an island, an unreachable sea crossing). */
export async function fetchRoute(from:LatLon,to:LatLon,mode:TravelMode,fetcher:typeof fetch=fetch):Promise<Route|null> {
  const points=`${from.lon},${from.lat};${to.lon},${to.lat}`;
  const response=await fetcher(`${ENDPOINT[mode]}/route/v1/driving/${points}?overview=full&geometries=geojson&steps=false`,{
    headers:{'User-Agent':'SvetIkonyRoutes/1.0 (https://svetikony.com)'},signal:AbortSignal.timeout(15_000),
  });
  const body=await response.json().catch(()=>null) as {code?:string;routes?:{distance:number;duration:number;geometry:{coordinates:[number,number][]}}[]}|null;
  if(body?.code==='NoRoute'||body?.code==='NoSegment')return null;
  if(!response.ok||body?.code!=='Ok'||!body.routes?.length)throw new ApiError(502,'ROUTING_UNAVAILABLE','Routing service unavailable');
  const [route]=body.routes;
  return {mode,distance:Math.round(route.distance),duration:Math.round(route.duration),coordinates:route.geometry.coordinates};
}
