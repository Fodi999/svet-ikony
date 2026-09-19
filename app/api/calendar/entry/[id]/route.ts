import {ApiError,withErrors} from '@/lib/d1/errors';
import {requireLocalCalendar} from '@/lib/church/geo-api';
import {calendarEntry} from '@/lib/d1/repositories/calendarGeo';
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return withErrors(async()=>{
    const url=requireLocalCalendar(request),{id}=await context.params;
    const locale=url.searchParams.get('locale')??'uk';
    if(!['uk','ru','en'].includes(locale)||id.length>160)throw ApiError.validation('Invalid entry or locale');
    return Response.json(await calendarEntry(id,locale),{headers:{'Cache-Control':'no-store'}});
  });
}
