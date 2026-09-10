import { requireTerrainLocal } from '@/lib/terrain/http';
import { TerrainStorage } from '@/lib/terrain/storage';
import { terrainPrefix } from '@/lib/terrain/contract';
import { getMediaBucket } from '@/lib/d1/env';
import { ApiError, withErrors } from '@/lib/d1/errors';
async function handle(request:Request,context:{params:Promise<{region:string;lod:string;file:string}>}){return withErrors(async()=>{
 requireTerrainLocal(request);const p=await context.params;const lod=/^L[123]$/.test(p.lod)?Number(p.lod.slice(1)):0;
 try{terrainPrefix(p.region,lod);}catch{throw ApiError.validation('Invalid terrain path');}
 const {object,expected}=await new TerrainStorage(await getMediaBucket()).file(p.region,lod,p.file);
 const headers={'content-type':expected.mimeType,'content-length':String(expected.size),'etag':object.httpEtag,'cache-control':'no-store'};
 if(request.method==='HEAD'){await object.body.cancel();return new Response(null,{headers});}
 return new Response(object.body,{headers});
});}
export const GET=handle;export const HEAD=handle;
