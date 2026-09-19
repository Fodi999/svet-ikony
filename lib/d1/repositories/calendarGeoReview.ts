import {d1All,d1First,d1Run,d1Prepare} from '@/lib/d1/db';
import {getDb} from '@/lib/d1/env';
import {ApiError} from '@/lib/d1/errors';
import {planCalendarReview,placeRevision,type ReviewCommand,type ReviewSnapshot} from '@/lib/church/geo-review-plan';

export const reviewFilters = {
  machine_high:"p.match_status='machine_high'",
  medium:"EXISTS(SELECT 1 FROM calendar_geo_profile_candidates c WHERE c.profile_id=p.id AND c.confidence='MEDIUM' AND c.status!='rejected')",
  low:"EXISTS(SELECT 1 FROM calendar_geo_profile_candidates c WHERE c.profile_id=p.id AND c.confidence='LOW' AND c.status!='rejected')",
  not_found:"p.match_status='not_found'",
  duplicate:"EXISTS(SELECT 1 FROM calendar_geo_profiles other WHERE other.id!=p.id AND lower(json_extract(other.profile_json,'$.names[0]'))=lower(json_extract(p.profile_json,'$.names[0]')))",
  needs_review:"p.match_status='needs_review'",
  multiple:"(SELECT count(*) FROM calendar_geo_profile_candidates c WHERE c.profile_id=p.id AND c.status!='rejected')>1",
  missing_geo:"NOT EXISTS (SELECT 1 FROM calendar_geo_relations r JOIN calendar_geo_places g ON g.id=r.place_id WHERE r.entity_id=p.entity_id AND g.lat IS NOT NULL AND r.match_status IN ('machine_high','reviewed_verified'))",
  missing_uk:"NOT EXISTS (SELECT 1 FROM calendar_geo_translations t WHERE t.entity_id=p.entity_id AND t.locale='uk' AND t.translation_status IN ('source','verified'))",
  missing_ru:"NOT EXISTS (SELECT 1 FROM calendar_geo_translations t WHERE t.entity_id=p.entity_id AND t.locale='ru' AND t.translation_status IN ('source','verified'))",
  missing_en:"NOT EXISTS (SELECT 1 FROM calendar_geo_translations t WHERE t.entity_id=p.entity_id AND t.locale='en' AND t.translation_status IN ('source','verified'))",
  missing_image:"NOT EXISTS (SELECT 1 FROM calendar_geo_images i WHERE i.entity_id=p.entity_id AND i.status='usable')",
  conflict:"EXISTS (SELECT 1 FROM calendar_geo_profile_candidates c WHERE c.profile_id=p.id AND json_extract(c.evidence_json,'$.conflict')=1)",
  all:'1=1',
} as const;

export async function calendarReviewQueue(params:URLSearchParams) {
  const filter=params.get('filter')??'needs_review';
  if(!Object.hasOwn(reviewFilters,filter))throw ApiError.validation('Unknown review filter');
  const offset=Number(params.get('offset')??0);
  if(!Number.isSafeInteger(offset)||offset<0)throw ApiError.validation('Invalid offset');
  const where=reviewFilters[filter as keyof typeof reviewFilters];
  const total=await d1First<{total:number}>(`SELECT count(*) AS total FROM calendar_geo_profiles p WHERE ${where}`);
  const items=await d1All(`SELECT p.id,p.entity_id AS entityId,json_extract(p.profile_json,'$.names[0]') AS title,
    p.match_status AS matchStatus,p.enrichment_status AS enrichmentStatus,p.updated_at AS revision,
    (SELECT count(*) FROM calendar_geo_profile_candidates c WHERE c.profile_id=p.id) AS candidates
    FROM calendar_geo_profiles p WHERE ${where} ORDER BY (SELECT count(*) FROM calendar_geo_rule_profiles rp JOIN calendar_geo_occurrences o ON o.rule_id=rp.rule_id WHERE rp.profile_id=p.id) DESC,p.id LIMIT 30 OFFSET ?`,offset);
  return {items,total:total?.total??0,offset,limit:30};
}

export async function calendarReviewProfile(id:string) {
  const row=await d1First<{id:string;entity_id:string|null;profile_json:string;match_status:string;updated_at:string}>('SELECT * FROM calendar_geo_profiles WHERE id=?',id);
  if(!row)throw ApiError.notFound('Unknown identity profile');
  const candidates=await d1All<{qid:string;confidence:string;evidence_json:string;status:string}>('SELECT * FROM calendar_geo_profile_candidates WHERE profile_id=? ORDER BY confidence,qid',id);
  const occurrences=await d1All(`SELECT o.civil_date AS date,r.source_title AS title,s.source_url AS source FROM calendar_geo_rule_profiles rp JOIN calendar_geo_rules r ON r.id=rp.rule_id JOIN calendar_geo_occurrences o ON o.rule_id=r.id JOIN calendar_geo_sources s ON s.id=r.source_id WHERE rp.profile_id=? ORDER BY date`,id);
  const places=row.entity_id?await d1All(`SELECT p.*,r.relation_type,r.match_status AS relation_status,s.source_url FROM calendar_geo_relations r JOIN calendar_geo_places p ON p.id=r.place_id JOIN calendar_geo_sources s ON s.id=r.source_id WHERE r.entity_id=?`,row.entity_id):[];
  const images=row.entity_id?await d1All('SELECT * FROM calendar_geo_images WHERE entity_id=?',row.entity_id):[];
  return {id:row.id,entityId:row.entity_id,profile:JSON.parse(row.profile_json),matchStatus:row.match_status,revision:row.updated_at,
    candidates:candidates.map(c=>({...c,evidence:JSON.parse(c.evidence_json),evidence_json:undefined})),occurrences,places:places.map(p=>({...p,revision:placeRevision(p)})),images};
}

export async function calendarReviewSnapshot(c:ReviewCommand):Promise<ReviewSnapshot> {
  const revision=await d1First<{revision:number}>('SELECT revision FROM calendar_geo_revision WHERE id=1');
  if(!revision)throw ApiError.conflict('Local review migration required');
  const profile=await d1First<ReviewSnapshot['profile']>('SELECT * FROM calendar_geo_profiles WHERE id=?',c.profileId);
  if(!profile)throw ApiError.notFound('Profile');
  const entity=profile.entity_id?await d1First('SELECT * FROM calendar_geo_entities WHERE id=?',profile.entity_id):null;
  const target=c.targetEntityId?await d1First('SELECT * FROM calendar_geo_entities WHERE id=?',c.targetEntityId):c.qid?await d1First('SELECT * FROM calendar_geo_entities WHERE wikidata_id=?',c.qid):null;
  const candidate=c.qid?await d1First('SELECT * FROM calendar_geo_profile_candidates WHERE profile_id=? AND qid=?',c.profileId,c.qid):null;
  const place=c.placeId?await d1First('SELECT p.* FROM calendar_geo_places p JOIN calendar_geo_relations r ON r.place_id=p.id WHERE p.id=? AND r.entity_id=?',c.placeId,profile.entity_id):null;
  const count=profile.entity_id?await d1First<{n:number}>('SELECT count(*) n FROM calendar_geo_profiles WHERE entity_id=? AND id!=?',profile.entity_id,profile.id):null;
  return {profile,entity,target,candidate,place,otherProfiles:count?.n??0,databaseRevision:revision.revision};
}
export async function applyCalendarReview(c:ReviewCommand,reviewer:string) {
  const previous=await d1First<{after_json:string;reviewed_by:string}>('SELECT after_json,reviewed_by FROM calendar_geo_review_log WHERE id=?',c.requestId);
  if(previous){if(previous.after_json!==JSON.stringify(c)||previous.reviewed_by!==reviewer)throw ApiError.conflict('Request ID reused');return {ok:true,replayed:true};}
  const snapshot=await calendarReviewSnapshot(c);
  if(c.action==='merge'){
    if(!snapshot.profile.entity_id||!c.targetEntityId)throw ApiError.validation('Merge entities required');
    const preview=await previewCalendarMerge(snapshot.profile.entity_id,c.targetEntityId);
    if(!c.previewToken||preview.previewToken!==c.previewToken)throw ApiError.conflict('Merge preview changed; review both entities again');
  }
  let plan;
  try{plan=planCalendarReview(snapshot,c,reviewer,new Date().toISOString());}catch(error){throw ApiError.validation(String(error));}
  const statements=[];for(const item of plan)statements.push(await d1Prepare(item.sql,...item.params));
  try{await (await getDb()).batch(statements);}catch(error){
    if(String(error).includes('CHECK constraint failed'))throw ApiError.conflict('Data changed during review; reload the preview');
    throw ApiError.database(error);
  }
  return {ok:true,replayed:false,profile:await calendarReviewProfile(c.profileId)};
}

export async function previewCalendarCandidate(profileId:string,qid:string) {
  if(!/^Q\d+$/.test(qid))throw ApiError.validation('Invalid QID');
  if(!await d1First('SELECT id FROM calendar_geo_profiles WHERE id=?',profileId))throw ApiError.notFound('Profile');
  const key=`review-preview:${qid}`;
  const cached=await d1First<{payload_json:string}>('SELECT payload_json FROM calendar_geo_http_cache WHERE cache_key=?',key);
  let entity:Record<string,unknown>;
  if(cached)entity=JSON.parse(cached.payload_json);
  else {
    const path=`$.body.entities.${qid}`;
    const imported=await d1First<{entity_json:string}>(`SELECT json_extract(payload_json,?) AS entity_json
      FROM calendar_geo_http_cache WHERE json_type(payload_json,?)='object'
      AND json_type(payload_json,?) IS NULL AND json_type(payload_json,?)='object'
      ORDER BY retrieved_at DESC LIMIT 1`,path,path,`${path}.missing`,`${path}.claims`);
    if(imported)entity=JSON.parse(imported.entity_json);
    else {
    const url=new URL('https://www.wikidata.org/w/api.php');
    url.search=new URLSearchParams({action:'wbgetentities',ids:qid,props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en',format:'json',maxlag:'5'}).toString();
    const response=await fetch(url,{headers:{'User-Agent':'SvetIkonyCalendarGeo/1.0 (https://svetikony.com)'},signal:AbortSignal.timeout(15000),redirect:'error'});
    const data=await response.json() as {error?:{code?:string};entities?:Record<string,Record<string,unknown>>};
    if(!response.ok||data.error)throw new ApiError(503,'WIKIMEDIA_RETRY','Wikimedia temporarily unavailable; retry preview');
    const found=data.entities?.[qid];if(!found||'missing'in found)throw ApiError.notFound('Wikidata entity');entity=found;
    await d1Run('INSERT INTO calendar_geo_http_cache(cache_key,url,retrieved_at,payload_json) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',key,url.href,new Date().toISOString(),JSON.stringify(entity));
    }
  }
  // A manual preview is not a HIGH match or confirmation.
  await d1Run("INSERT INTO calendar_geo_profile_candidates(profile_id,qid,confidence,evidence_json) VALUES (?,?,'LOW',?) ON CONFLICT DO NOTHING",profileId,qid,JSON.stringify({manualPreview:true}));
  return {qid,entity};
}

export async function previewCalendarMerge(source:string,target:string) {
  async function graph(id:string){
    const entity=await d1First('SELECT * FROM calendar_geo_entities WHERE id=?',id);if(!entity)throw ApiError.notFound('Entity');
    return {entity,translations:await d1All('SELECT * FROM calendar_geo_translations WHERE entity_id=?',id),
      places:await d1All('SELECT p.*,r.relation_type,r.geo_status AS relationGeoStatus FROM calendar_geo_relations r JOIN calendar_geo_places p ON p.id=r.place_id WHERE r.entity_id=?',id),
      content:await d1All('SELECT * FROM calendar_geo_content_links WHERE entity_id=?',id),
      occurrences:await d1All('SELECT o.* FROM calendar_geo_occurrences o JOIN calendar_geo_rules r ON r.id=o.rule_id WHERE r.entity_id=?',id),
      provenance:await d1All('SELECT * FROM calendar_geo_provenance WHERE entity_id=?',id)};
  }
  const result={source:await graph(source),target:await graph(target)};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(result)));
  return {...result,previewToken:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
}
