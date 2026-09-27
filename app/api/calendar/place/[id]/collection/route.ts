import {ApiError,withErrors} from '@/lib/d1/errors';
import {requirePublicCalendar} from '@/lib/church/geo-api';
import {getPlaceCollection} from '@/lib/d1/repositories/calendarGeoPlaces';
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return withErrors(async()=>{
    const url=requirePublicCalendar(request),{id}=await context.params;
    const locale=url.searchParams.get('locale')??'uk';
    if(!['uk','ru','en'].includes(locale)||id.length>160)throw ApiError.validation('Invalid place or locale');
    return Response.json(await getPlaceCollection(id,locale as 'uk'|'ru'|'en'),{headers:{'Cache-Control':'no-store'}});
  });
}
