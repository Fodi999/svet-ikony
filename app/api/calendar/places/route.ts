import {withErrors} from '@/lib/d1/errors';
import {placesBboxQuery,requirePublicCalendar} from '@/lib/church/geo-api';
import {listSacredPlaces} from '@/lib/d1/repositories/calendarGeoPlaces';
export async function GET(request:Request) {
  return withErrors(async()=>{
    const url=requirePublicCalendar(request);
    const {bbox,zoom,locale}=placesBboxQuery(url.searchParams);
    return Response.json(await listSacredPlaces(bbox,zoom,locale),{headers:{'Cache-Control':'no-store'}});
  });
}
