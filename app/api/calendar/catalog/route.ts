import {withErrors,ApiError} from '@/lib/d1/errors';
import {requireLocalCalendar} from '@/lib/church/geo-api';
import {calendarGeoCatalog} from '@/lib/d1/repositories/calendarGeo';
export async function GET(request:Request) {
  return withErrors(async()=>{
    const url=requireLocalCalendar(request),locale=url.searchParams.get('locale')??'uk';
    if(!['uk','ru','en'].includes(locale))throw ApiError.validation('Invalid locale');
    return Response.json(await calendarGeoCatalog(locale),{headers:{'Cache-Control':'no-store'}});
  });
}
