import {requireSuperAdmin} from '@/lib/d1/auth';
import {withErrors} from '@/lib/d1/errors';
import {getGeoPlace,updateGeoPlace} from '@/lib/d1/repositories/geoPlaceAdmin';

type Context={params:Promise<{id:string}>};
const noStore={'Cache-Control':'no-store'};
// Place IDs carry a namespace (manual:<uuid>, wd:Q123, place-...), always URL-encoded by the admin.
const placeId=async(context:Context)=>{const {id}=await context.params;return id.includes('%')?decodeURIComponent(id):id;};
export async function GET(request:Request,context:Context){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await getGeoPlace(await placeId(context)),{headers:noStore});
});}
export async function PUT(request:Request,context:Context){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await updateGeoPlace(await placeId(context),await request.json()),{headers:noStore});
});}
