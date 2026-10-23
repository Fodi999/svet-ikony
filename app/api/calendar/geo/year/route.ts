import {withErrors} from '@/lib/d1/errors';
import {calendarYearQuery,requirePublicCalendar} from '@/lib/church/geo-api';
import {calendarGeoYear} from '@/lib/d1/repositories/calendarGeo';
/** Days with mappable commemorations in one year, for the globe's calendar timeline. */
export async function GET(request:Request) {
  return withErrors(async()=>{
    const url=requirePublicCalendar(request);
    return Response.json({days:await calendarGeoYear(calendarYearQuery(url.searchParams))},{headers:{'Cache-Control':'no-store'}});
  });
}
