import { requireSuperAdmin } from '@/lib/d1/auth';
import { getMediaBucket } from '@/lib/d1/env';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { terrainPrefix } from './contract';
import { TerrainStorage } from './storage';
export function requireTerrainLocal(request:Request) {
 const url=new URL(request.url);
 // Runtime check, not Host-only: a deployed/production build cannot enable writes.
 if(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw ApiError.authorization('Terrain API is LOCAL development only');
}
export function terrainHandler(request:Request,params:Promise<{region:string;lod:string}>,fn:(storage:TerrainStorage,region:string,lod:number)=>Promise<Response>) {
 return withErrors(async()=>{
  requireTerrainLocal(request);await requireSuperAdmin(request);
  const p=await params;const lod=/^L[123]$/.test(p.lod)?Number(p.lod.slice(1)):0;
  try{terrainPrefix(p.region,lod);}catch{throw ApiError.validation('Invalid terrain region/LOD');}
  return fn(new TerrainStorage(await getMediaBucket()),p.region,lod);
 });
}
export async function boundedBody(request:Request,limit:number):Promise<ArrayBuffer> {
 const declared=request.headers.get('content-length');if(declared && Number(declared)>limit)throw ApiError.validation('Request too large');
 const reader=request.body?.getReader();if(!reader)throw ApiError.validation('Request body missing');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw ApiError.validation('Request too large');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes.buffer;
}
