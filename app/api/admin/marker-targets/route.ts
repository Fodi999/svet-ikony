import {requireSuperAdmin} from '@/lib/d1/auth';
import {withErrors,ApiError} from '@/lib/d1/errors';
import {getDb} from '@/lib/d1/env';
import {christianPlaces} from '@/lib/cesium/christian-places';
import {createMarkerPlace} from '@/lib/d1/repositories/createMarkerPlace';

export async function GET(request:Request){return withErrors(async()=>{
 await requireSuperAdmin(request);const db=await getDb();
 const {results:places}=await db.prepare('SELECT id,canonical_name AS title,place_type AS type FROM calendar_geo_places').all<{id:string;title:string;type:string}>();
 const {results:entities}=await db.prepare("SELECT id,canonical_name AS title FROM calendar_geo_entities WHERE entity_type='saint'").all<{id:string;title:string}>();
 const {results:links}=await db.prepare("SELECT entity_id AS entityId,translation_group_id AS groupId FROM calendar_geo_content_links WHERE content_type='saint'").all();
 return Response.json({places:[...places,...christianPlaces.filter(p=>p.type!=='saint_place'&&!places.some(row=>row.id===p.id)).map(p=>({id:p.id,title:p.name.uk,type:p.type}))],saints:[...entities,...christianPlaces.filter(p=>p.type==='saint_place'&&!entities.some(row=>row.id===`place:${p.id}`)).map(p=>({id:`place:${p.id}`,title:p.name.uk}))],links},{headers:{'Cache-Control':'no-store'}});
});}

export async function POST(request:Request){return withErrors(async()=>{
 await requireSuperAdmin(request);const raw=await request.json();const db=await getDb();
 if(!raw||typeof raw!=='object')throw ApiError.validation('Object required');
 if('kind' in raw&&raw.kind==='create-place')return Response.json(await createMarkerPlace('place' in raw?raw.place:undefined),{status:201});
 const body=raw as {id?:string;kind?:string;groupId?:string};
 if(!body||typeof body.id!=='string')throw ApiError.validation('Marker ID required');
 if(body.kind==='place'){
  const existing=await db.prepare('SELECT id FROM calendar_geo_places WHERE id=?').bind(body.id).first();
  if(!existing){
   const place=christianPlaces.find(p=>p.id===body.id&&p.type!=='saint_place');
   if(!place)throw ApiError.notFound('Unknown place marker');
   await db.prepare("INSERT INTO calendar_geo_places(id,canonical_name,lat,lon,place_type,verification_status) VALUES(?,?,?,?,?,'needs_review')").bind(place.id,place.name.uk,place.lat,place.lng,place.type==='monastery'?'monastery':place.type==='cathedral'?'church':'pilgrimage_place').run();
  }
  return Response.json({placeId:body.id});
 }
 if(body.kind!=='saint'||typeof body.groupId!=='string')throw ApiError.validation('Saint group required');
 if(!await db.prepare('SELECT id FROM church_saints WHERE translation_group_id=? LIMIT 1').bind(body.groupId).first())throw ApiError.notFound('Unknown saint group');
 const existing=await db.prepare("SELECT id FROM calendar_geo_entities WHERE id=? AND entity_type='saint'").bind(body.id).first();
 const place=christianPlaces.find(p=>`place:${p.id}`===body.id&&p.type==='saint_place');
 if(!existing&&!place)throw ApiError.notFound('Unknown saint marker');
 const other=await db.prepare("SELECT translation_group_id FROM calendar_geo_content_links WHERE entity_id=? AND content_type='saint' AND translation_group_id!=?").bind(body.id,body.groupId).first();
 if(other)throw ApiError.conflict('Marker already linked to another saint');
 const statements=[];
 if(!existing)statements.push(db.prepare("INSERT OR IGNORE INTO calendar_geo_entities(id,entity_type,canonical_name,verification_status) VALUES(?,'saint',?,'needs_review')").bind(body.id,place!.name.uk));
 statements.push(db.prepare("INSERT OR IGNORE INTO calendar_geo_content_links(entity_id,content_type,translation_group_id) VALUES(?,'saint',?)").bind(body.id,body.groupId));
 await db.batch(statements);
 return Response.json({entityId:body.id,groupId:body.groupId});
});}
