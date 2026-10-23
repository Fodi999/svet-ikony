import {requireSuperAdmin} from '@/lib/d1/auth';
import {withErrors} from '@/lib/d1/errors';
import {createGeoPlace,listGeoPlaces} from '@/lib/d1/repositories/geoPlaceAdmin';

const noStore={'Cache-Control':'no-store'};
/** Admin place catalog (calendar_geo_places) for the saint "Globe" tab and
 * the "Places on the globe" page: search, and create a new real place. */
export async function GET(request:Request){return withErrors(async()=>{
  await requireSuperAdmin(request);
  const url=new URL(request.url);
  return Response.json(await listGeoPlaces(url.searchParams.get('q')??'',Number(url.searchParams.get('limit')??50)||50),{headers:noStore});
});}
export async function POST(request:Request){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await createGeoPlace(await request.json()),{status:201,headers:noStore});
});}
