import {TerrainStorage,terrainHash} from './storage';
import {parseTerrainManifest} from './contract';
export function mockBucket(){
 const data=new Map<string,{bytes:ArrayBuffer;mime:string;etag:string}>();let revision=0;const puts:string[]=[];
 const object=(key:string)=>{const v=data.get(key);return v?{key,size:v.bytes.byteLength,etag:v.etag,httpEtag:'"'+v.etag+'"',httpMetadata:{contentType:v.mime},body:new Response(v.bytes).body!,arrayBuffer:async()=>v.bytes,json:async()=>JSON.parse(new TextDecoder().decode(v.bytes))}:null;};
 const bucket={async get(key:string){return object(key);},async head(key:string){return object(key);},async list({prefix}:{prefix:string}){return {truncated:false,objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(k=>object(k))};},async put(key:string,bytes:ArrayBuffer,options:R2PutOptions){
  const existing=data.get(key),condition=options.onlyIf as R2Conditional|undefined;
  if(condition?.etagDoesNotMatch==='*'&&existing)return null;
  if(condition?.etagMatches&&existing?.etag!==condition.etagMatches)return null;
  puts.push(key);data.set(key,{bytes,mime:(options.httpMetadata as R2HTTPMetadata).contentType!,etag:String(++revision)});return object(key);
 },async delete(){throw new Error('Deletion forbidden');}} as unknown as R2Bucket;
 return {bucket,data,puts};
}
export async function fixture(){
 const b=mockBucket();const json=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},nodes:[]}));const pad=Math.ceil(json.length/4)*4;const bytes=new ArrayBuffer(20+pad),view=new DataView(bytes);[0x46546c67,2,bytes.byteLength,pad,0x4e4f534a].forEach((v,i)=>view.setUint32(i*4,v,true));new Uint8Array(bytes,20).fill(32);new Uint8Array(bytes,20,json.length).set(json);
 const sha=await terrainHash(bytes);
 const manifest=parseTerrainManifest({region:'test',bounds:{minLon:20,minLat:41,maxLon:28,maxLat:45},grid:{lod:1,countX:1,countY:1,xDirection:'east',yDirection:'south'},coordinateSystem:{east:'+X',north:'-Z',up:'+Y',projection:'spherical AEQD + spherical sag',origin:{latitude:43,longitude:24},metersPerUnit:100000,earthRadiusMeters:6371000,heightExaggeration:14,vertexCoordinates:'baked regional coordinates; identity object transforms, no independent tile recentering'},tiles:[{tile_id:'l1_0_0',lod:1,x:0,y:0,file:'0_0.glb',file_size_bytes:bytes.byteLength,sha256:sha,min_lat:41,max_lat:45,min_lon:20,max_lon:28,world_position:[0,0,0],world_scale:[1,1,1]}]});
 return {...b,bytes,manifest,storage:new TerrainStorage(b.bucket)};
}
