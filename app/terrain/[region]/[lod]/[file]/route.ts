import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireTerrainLocal } from '@/lib/terrain/http';
import { TerrainStorage } from '@/lib/terrain/storage';
import { terrainPrefix } from '@/lib/terrain/contract';
import { getMediaBucket } from '@/lib/d1/env';
import { ApiError, withErrors } from '@/lib/d1/errors';

/**
 * Regions served straight from tools/terrain/{region}/build/ on local disk
 * instead of R2 -- local-only prototype data (e.g. Alps, see chat), never
 * uploaded. Deliberately never falls through to R2 for these: a missing
 * local file is a dev error, not a silent remote fetch. Everything else
 * (eastern_europe_test/Ukraine) keeps its existing R2-backed behavior
 * completely unchanged.
 */
const LOCAL_ONLY_TERRAIN_REGIONS = new Set(['alps']);

function localContentType(file: string) {
  if (file === 'heights.bin') return 'application/octet-stream';
  if (file === 'manifest.json') return 'application/json';
  if (/^\d+_\d+\.glb$/.test(file)) return 'model/gltf-binary';
  return null;
}

async function serveLocal(region: string, lod: number, file: string, method: string) {
  const mimeType = localContentType(file);
  if (![0,1,2].includes(lod) || !mimeType || (file === 'heights.bin' && lod !== 2)) throw ApiError.notFound('Terrain file not registered');
  const filePath = path.join(process.cwd(), 'tools/terrain', region, 'build', `L${lod}`, file);
  let body: ArrayBuffer;
  try {
    const view = await readFile(filePath);
    body = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const message = `Local terrain file not found: tools/terrain/${region}/build/${file}\nRun: npm run terrain:${region}:generate`;
      console.warn(message);
      throw ApiError.notFound(message);
    }
    throw error;
  }
  const headers = { 'content-type': mimeType, 'content-length': String(body.byteLength), 'cache-control': 'no-store' };
  if (method === 'HEAD') return new Response(null, { headers });
  return new Response(body, { headers });
}

async function handle(request:Request,context:{params:Promise<{region:string;lod:string;file:string}>}){return withErrors(async()=>{
 requireTerrainLocal(request);const p=await context.params;
 if(LOCAL_ONLY_TERRAIN_REGIONS.has(p.region)){
   if(!/^L[012]$/.test(p.lod))throw ApiError.validation('Invalid local LOD');
   return serveLocal(p.region,Number(p.lod.slice(1)),p.file,request.method);
 }
 const lod=/^L[123]$/.test(p.lod)?Number(p.lod.slice(1)):0;
 try{terrainPrefix(p.region,lod);}catch{throw ApiError.validation('Invalid terrain path');}
 if(LOCAL_ONLY_TERRAIN_REGIONS.has(p.region))return serveLocal(p.region,lod,p.file,request.method);
 const {object,expected}=await new TerrainStorage(await getMediaBucket()).file(p.region,lod,p.file);
 const headers={'content-type':expected.mimeType,'content-length':String(expected.size),'etag':object.httpEtag,'cache-control':'no-store'};
 if(request.method==='HEAD'){await object.body.cancel();return new Response(null,{headers});}
 return new Response(object.body,{headers});
});}
export const GET=handle;export const HEAD=handle;
