import {withErrors} from '@/lib/d1/errors';
import {publicMarkerImages} from '@/lib/d1/repositories/markerImages';
export async function GET(){return withErrors(async()=>Response.json(await publicMarkerImages(),{headers:{'Cache-Control':'no-store'}}));}
