import {requireSuperAdmin} from '@/lib/d1/auth';
import {withErrors} from '@/lib/d1/errors';
import {linkSaintPlace,listSaintPlaces,setSaintPlaceVerified,unlinkSaintPlace} from '@/lib/d1/repositories/geoPlaceAdmin';

const noStore={'Cache-Control':'no-store'};
/** Saint (church_saints translation group) <-> place links, stored in the
 * existing many-to-many calendar_geo_relations table. */
export async function GET(request:Request){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await listSaintPlaces(new URL(request.url).searchParams.get('groupId')??''),{headers:noStore});
});}
export async function POST(request:Request){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await linkSaintPlace(await request.json()),{headers:noStore});
});}
/** Explicit administrator confirmation of a link ({..., verified: boolean}). */
export async function PUT(request:Request){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await setSaintPlaceVerified(await request.json()),{headers:noStore});
});}
export async function DELETE(request:Request){return withErrors(async()=>{
  await requireSuperAdmin(request);
  return Response.json(await unlinkSaintPlace(await request.json()),{headers:noStore});
});}
