import {withErrors} from '@/lib/d1/errors';
import {fetchRoute,parseLatLon,parseMode,ROUTE_ATTRIBUTION} from '@/lib/routes/osrm';
/** GET /api/routes?from=lat,lon&to=lat,lon&mode=car|foot -- "how to get there" for a place on the globe.
 * The visitor's position is used for this one request only and never stored. */
export async function GET(request:Request) {
  return withErrors(async()=>{
    const params=new URL(request.url).searchParams;
    const route=await fetchRoute(parseLatLon(params.get('from'),'from'),parseLatLon(params.get('to'),'to'),parseMode(params.get('mode')));
    return Response.json({route,attribution:ROUTE_ATTRIBUTION},{headers:{'Cache-Control':'private, no-store'}});
  });
}
