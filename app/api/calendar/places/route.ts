import {withErrors} from '@/lib/d1/errors';
import {placesBboxQuery,requirePublicCalendar} from '@/lib/church/geo-api';
import {listPublishedPlaceModels,listSacredPlaces} from '@/lib/d1/repositories/calendarGeoPlaces';
export async function GET(request:Request) {
  return withErrors(async()=>{
    const url=requirePublicCalendar(request);
    const {bbox,zoom,locale}=placesBboxQuery(url.searchParams);
    const [places,models]=await Promise.all([listSacredPlaces(bbox,zoom,locale),listPublishedPlaceModels()]);
    return Response.json(places.map(place=>models[place.id]?{...place,model:models[place.id]}:place),{headers:{'Cache-Control':'no-store'}});
  });
}
