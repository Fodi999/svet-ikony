import {withErrors} from '@/lib/d1/errors';
import {calendarQuery,requirePublicCalendar} from '@/lib/church/geo-api';
import {calendarGeoDay} from '@/lib/d1/repositories/calendarGeo';
export async function GET(request:Request) {
  return withErrors(async()=>{
    const url=requirePublicCalendar(request);
    return Response.json(await calendarGeoDay(calendarQuery(url.searchParams)),{headers:{'Cache-Control':'no-store'}});
  });
}
