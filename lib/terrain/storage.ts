import { ApiError } from '@/lib/d1/errors';
import { validateGlb } from '@/lib/media/glb';
import { parseTerrainManifest, validateTerrainGlbMetadata, terrainPrefix, MAX_TERRAIN_MANIFEST_BYTES, MAX_TERRAIN_TILE_BYTES, type TerrainManifest } from './contract';
export async function terrainHash(bytes:ArrayBuffer) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
function encode(value:unknown):ArrayBuffer {return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;}
type Metadata={schemaVersion:1;bundleId:string;manifestSha256:string;manifestSize:number;manifest:TerrainManifest;state:'staging'|'complete'};
type Expected={key:string;size:number;sha256:string;mimeType:string};
export class TerrainStorage {
 constructor(private bucket:R2Bucket){}
 private async keys(prefix:string) {const keys:string[]=[];let cursor:string|undefined;do{const page=await this.bucket.list({prefix,cursor,limit:1000});keys.push(...page.objects.map(o=>o.key));if(keys.length>258)throw ApiError.conflict('Unexpected objects in terrain prefix');cursor=page.truncated?page.cursor:undefined;}while(cursor);return keys;}
 private async metadata(region:string,lod:number) {
  const prefix=terrainPrefix(region,lod),object=await this.bucket.get(prefix+'_bundle.json');if(!object)return null;
  if(object.size>2*MAX_TERRAIN_MANIFEST_BYTES)throw ApiError.conflict('Invalid terrain metadata size');
  const data=await object.json<Metadata>();const manifest=parseTerrainManifest(data.manifest);
  const bytes=encode(manifest);
  if(data.schemaVersion!==1||manifest.region!==region||manifest.grid.lod!==lod||data.bundleId!==await terrainHash(bytes)||data.manifestSha256!==data.bundleId||data.manifestSize!==bytes.byteLength||!['staging','complete'].includes(data.state))throw ApiError.conflict('Terrain metadata integrity failure');
  return {data,etag:object.etag};
 }
 private expected(data:Metadata):Expected[] {const prefix=terrainPrefix(data.manifest.region,data.manifest.grid.lod);return [{key:prefix+'manifest.json',size:data.manifestSize,sha256:data.manifestSha256,mimeType:'application/json'},...data.manifest.tiles.map(t=>({key:prefix+`${t.x}_${t.y}.glb`,size:t.file_size_bytes,sha256:t.sha256,mimeType:'model/gltf-binary'}))];}
 private async inspect(e:Expected) {
  const object=await this.bucket.get(e.key);if(!object)return {...e,status:'missing' as const};
  if(object.size!==e.size||object.httpMetadata?.contentType!==e.mimeType){await object.body.cancel();return {...e,status:'mismatch' as const,actualSize:object.size,actualMime:object.httpMetadata?.contentType};}
  const bytes=await object.arrayBuffer(),actualHash=await terrainHash(bytes);
  return {...e,status:actualHash===e.sha256?'verified' as const:'mismatch' as const,actualHash};
 }
 async status(region:string,lod:number) {
  const prefix=terrainPrefix(region,lod),metadata=await this.metadata(region,lod),keys=await this.keys(prefix);
  if(!metadata)return {bundleId:null,state:keys.length?'conflict':'absent',complete:false,verifiedAll:false,objects:[],unexpected:keys};
  const expected=this.expected(metadata.data),allowed=new Set([...expected.map(e=>e.key),prefix+'_bundle.json']);
  const unexpected=keys.filter(k=>!allowed.has(k)),objects=[];
  for(const e of expected)objects.push(await this.inspect(e));
  const verifiedAll=!unexpected.length&&objects.every(o=>o.status==='verified');
  return {bundleId:metadata.data.bundleId,state:unexpected.length||objects.some(o=>o.status==='mismatch')?'conflict':metadata.data.state,complete:metadata.data.state==='complete'&&verifiedAll,verifiedAll,objects,unexpected,tileCount:metadata.data.manifest.tiles.length,manifestKey:prefix+'manifest.json'};
 }
 private async putOnce(e:Expected,bytes:ArrayBuffer,bundleId:string) {
  if(bytes.byteLength!==e.size||await terrainHash(bytes)!==e.sha256)throw ApiError.validation('Terrain bytes/hash mismatch');
  const result=await this.bucket.put(e.key,bytes,{httpMetadata:{contentType:e.mimeType},customMetadata:{bundleId,sha256:e.sha256},onlyIf:{etagDoesNotMatch:'*'}});
  const readback=await this.inspect(e);
  if(readback.status!=='verified')throw ApiError.conflict(result?'Terrain write failed readback':'Existing terrain object conflicts; overwrite forbidden');
  return readback;
 }
 async begin(region:string,lod:number,input:unknown) {
  const manifest=parseTerrainManifest(input);
  if(manifest.region!==region||manifest.grid.lod!==lod||manifest.tiles.some(t=>t.file!==`${t.x}_${t.y}.glb`))throw ApiError.validation('Manifest destination mismatch');
  const bytes=encode(manifest);if(bytes.byteLength>MAX_TERRAIN_MANIFEST_BYTES)throw ApiError.validation('Manifest too large');
  const bundleId=await terrainHash(bytes),prefix=terrainPrefix(region,lod);
  let existing=await this.metadata(region,lod);
  if(existing&&existing.data.bundleId!==bundleId)throw ApiError.conflict('Region/LOD belongs to a different immutable bundle');
  if(!existing){
   if((await this.keys(prefix)).length)throw ApiError.conflict('Unowned existing terrain objects; overwrite forbidden');
   const data:Metadata={schemaVersion:1,bundleId,manifestSha256:bundleId,manifestSize:bytes.byteLength,manifest,state:'staging'};
   await this.bucket.put(prefix+'_bundle.json',encode(data),{httpMetadata:{contentType:'application/json'},onlyIf:{etagDoesNotMatch:'*'}});
   existing=await this.metadata(region,lod);
   if(!existing||existing.data.bundleId!==bundleId)throw ApiError.conflict('Concurrent terrain reservation conflict');
  }
  await this.putOnce(this.expected(existing.data)[0],bytes,bundleId);
  return this.status(region,lod);
 }
 async tile(region:string,lod:number,name:string,bundleId:string,bytes:ArrayBuffer,mime:string) {
  const record=await this.metadata(region,lod);if(!record||record.data.bundleId!==bundleId)throw ApiError.conflict('Bundle identity mismatch');
  if(mime!=='model/gltf-binary'||bytes.byteLength>MAX_TERRAIN_TILE_BYTES)throw ApiError.validation('Invalid terrain GLB MIME/size');
  const expected=this.expected(record.data).find(e=>e.key===terrainPrefix(region,lod)+name+'.glb');
  if(!expected)throw ApiError.validation('Tile not in approved manifest');
  validateGlb(bytes);
  const tile=record.data.manifest.tiles.find(t=>`${t.x}_${t.y}`===name)!;
  validateTerrainGlbMetadata(JSON.parse(new TextDecoder().decode(bytes.slice(20,20+new DataView(bytes).getUint32(12,true)))),tile);
  return this.putOnce(expected,bytes,bundleId);
 }
 async reconcile(region:string,lod:number,bundleId:string) {
  const status=await this.status(region,lod);if(status.bundleId!==bundleId)throw ApiError.conflict('Bundle identity mismatch');
  if(!status.verifiedAll)return status;
  const record=await this.metadata(region,lod);if(!record||record.data.bundleId!==bundleId)throw ApiError.conflict('Bundle changed');
  if(record.data.state!=='complete'){
   const result=await this.bucket.put(terrainPrefix(region,lod)+'_bundle.json',encode({...record.data,state:'complete'}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:record.etag}});
   if(!result)throw ApiError.conflict('Metadata changed during completion; reconcile again');
  }
  return this.status(region,lod);
 }
 async file(region:string,lod:number,name:string) {
  const record=await this.metadata(region,lod);if(!record||record.data.state!=='complete')throw ApiError.notFound('Terrain bundle not complete');
  const expected=this.expected(record.data).find(e=>e.key===terrainPrefix(region,lod)+name);if(!expected)throw ApiError.notFound('Terrain file not registered');
  const checked=await this.inspect(expected);if(checked.status!=='verified')throw ApiError.conflict('Terrain file integrity failure');
  const object=await this.bucket.get(expected.key);if(!object)throw ApiError.notFound('Terrain file missing');return {object,expected};
 }
}
