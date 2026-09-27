import {getDb,getMediaBucket} from '../env';
import {ApiError} from '../errors';

export type ImageVersion={id:string;owner_id:string;original_key:string;marker_key:string;panel_key:string;crop_x:number;crop_y:number;crop_width:number;crop_height:number;identity_verified:number;rights_verified:number;source_url:string;author:string;rights_statement:string};
export type ImageDraft={originalKey:string;markerKey:string;panelKey:string;originalWidth:number;originalHeight:number;crop:{x:number;y:number;width:number;height:number};identityVerified:boolean;rightsVerified:boolean;source:string;author:string;rights:string};
export async function imageOwner(kind:string,id:string){
 const db=await getDb();
 if(!['saint','place'].includes(kind))throw ApiError.validation('Invalid owner type');
 const valid=kind==='saint'?await db.prepare('SELECT id FROM church_saints WHERE translation_group_id=? LIMIT 1').bind(id).first():await db.prepare('SELECT id FROM calendar_geo_places WHERE id=?').bind(id).first();
 if(!valid)throw ApiError.notFound('Unknown image owner');
 const owner=`${kind}:${id}`;
 await db.prepare('INSERT OR IGNORE INTO globe_marker_image_owners(id,saint_group_id,place_id) VALUES(?,?,?)').bind(owner,kind==='saint'?id:null,kind==='place'?id:null).run();
 const row=await db.prepare(`SELECT id FROM globe_marker_image_owners WHERE ${kind==='saint'?'saint_group_id':'place_id'}=?`).bind(id).first<{id:string}>();
 return row!.id;
}
export async function markerImageState(kind:string,id:string){
 const owner=await imageOwner(kind,id),db=await getDb();
 const state=await db.prepare('SELECT draft_version_id,published_version_id FROM globe_marker_image_state WHERE owner_id=?').bind(owner).first<{draft_version_id:string|null;published_version_id:string|null}>();
 const version=async(key:string|null|undefined)=>key?db.prepare('SELECT * FROM globe_marker_image_versions WHERE id=? AND owner_id=?').bind(key,owner).first<ImageVersion>():null;
 return {owner,draft:await version(state?.draft_version_id),published:await version(state?.published_version_id)};
}
export function validateDraft(input:ImageDraft){
 if(!input||typeof input!=='object')throw ApiError.validation('Draft required');
 const c=input.crop;
 if(!c||![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>1.000001||c.y+c.height>1.000001)throw ApiError.validation('Invalid crop');
 if(!Number.isInteger(input.originalWidth)||!Number.isInteger(input.originalHeight)||input.originalWidth<1||input.originalHeight<1)throw ApiError.validation('Invalid dimensions');
 for(const key of [input.originalKey,input.markerKey,input.panelKey])if(typeof key!=='string'||!/^media\/[a-zA-Z0-9_/-]+\.[a-z0-9]+$/.test(key)||key.includes('..'))throw ApiError.validation('Stable media keys required');
 if(new Set([input.originalKey,input.markerKey,input.panelKey]).size!==3)throw ApiError.validation('Distinct variant keys required');
 if(typeof input.identityVerified!=='boolean'||typeof input.rightsVerified!=='boolean')throw ApiError.validation('Explicit confirmations required');
 for(const text of [input.source,input.author,input.rights])if(typeof text!=='string'||text.length>2000)throw ApiError.validation('Invalid provenance');
 if(input.rightsVerified&&!input.rights.trim())throw ApiError.validation('Rights statement required');
}
async function pngDimensions(key:string){
 const file=await (await getMediaBucket()).get(key);if(!file)throw ApiError.validation('Image file missing');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length<24||bytes.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10')throw ApiError.validation('Derivatives must be PNG');
 const view=new DataView(bytes.buffer);return [view.getUint32(16),view.getUint32(20)];
}
export async function saveMarkerDraft(kind:string,id:string,input:ImageDraft){
 validateDraft(input);const owner=await imageOwner(kind,id),db=await getDb(),bucket=await getMediaBucket();
 if(!await bucket.head(input.originalKey))throw ApiError.validation('Original missing');
 const marker=await pngDimensions(input.markerKey),panel=await pngDimensions(input.panelKey);
 if(marker[0]!==256||marker[1]!==256||panel[0]!==800||panel[1]!==800)throw ApiError.validation('Expected 256px marker and 800px panel');
 const version=crypto.randomUUID();
 const assets=[[input.originalKey,'original',input.originalWidth,input.originalHeight],[input.markerKey,'marker',256,256],[input.panelKey,'panel',800,800]];
 const c=input.crop;
 await db.batch([
 ...assets.map(row=>db.prepare('INSERT OR IGNORE INTO globe_marker_image_assets(object_key,role,width,height) VALUES(?,?,?,?)').bind(...row)),
 db.prepare('INSERT INTO globe_marker_image_versions(id,owner_id,original_key,marker_key,panel_key,crop_x,crop_y,crop_width,crop_height,identity_verified,verified_original_key,rights_verified,source_url,author,rights_statement) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(version,owner,input.originalKey,input.markerKey,input.panelKey,c.x,c.y,c.width,c.height,Number(input.identityVerified),input.identityVerified?input.originalKey:null,Number(input.rightsVerified),input.source,input.author,input.rights),
 db.prepare('INSERT INTO globe_marker_image_state(owner_id,draft_version_id) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET draft_version_id=excluded.draft_version_id').bind(owner,version)
 ]);return markerImageState(kind,id);
}
export async function publishMarkerImage(kind:string,id:string,versionId:string|null){
 const state=await markerImageState(kind,id),db=await getDb();
 if(versionId){
  if(state.draft?.id!==versionId)throw ApiError.conflict('Draft changed; reload before publishing');
  if(!state.draft.identity_verified||!state.draft.rights_verified)throw ApiError.validation('Both confirmations required');
  const bucket=await getMediaBucket();
  for(const key of [state.draft.original_key,state.draft.marker_key,state.draft.panel_key])if(!await bucket.head(key))throw ApiError.validation('Image variant missing; publication unchanged');
 }
 const result=await db.prepare('UPDATE globe_marker_image_state SET published_version_id=? WHERE owner_id=? AND (? IS NULL OR draft_version_id=?)').bind(versionId,state.owner,versionId,versionId).run();
 if(!result.meta.changes&&versionId)throw ApiError.conflict('Draft changed');
 return markerImageState(kind,id);
}
export async function publicMarkerImages(){
 const db=await getDb();
 const {results}=await db.prepare(`SELECT o.id AS ownerId,l.entity_id AS entityId,o.place_id AS placeId,p.version_id AS versionId,p.marker_key AS markerKey,p.panel_key AS panelKey FROM globe_marker_image_owners o
 LEFT JOIN globe_marker_published_images p ON p.owner_id=o.id
 LEFT JOIN calendar_geo_content_links l ON l.translation_group_id=o.saint_group_id AND l.content_type='saint'
 WHERE o.place_id IS NOT NULL OR EXISTS(SELECT 1 FROM church_saints s WHERE s.translation_group_id=o.saint_group_id AND s.status='published')`).all();
 return results;
}
