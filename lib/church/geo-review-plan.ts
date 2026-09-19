export type Statement={sql:string;params:unknown[]};
export type ReviewCommand={requestId:string;profileId:string;revision:string;action:string;qid?:string;entityType?:string;reason?:string;
  placeId?:string;name?:string;historicalName?:string;modernName?:string;lat?:number;lon?:number;relationType?:string;
  sourceUrl?:string;sourceNote?:string;geoStatus?:string;targetEntityId?:string;previewToken?:string;placeRevision?:string;originalRelationType?:string};
export type ReviewSnapshot={profile:{id:string;entity_id:string|null;profile_json:string;updated_at:string};
  entity:Record<string,unknown>|null;databaseRevision?:number;otherProfiles?:number;target?:Record<string,unknown>|null;candidate?:Record<string,unknown>|null;place?:Record<string,unknown>|null};
const relations=['birth','ministry','residence','martyrdom','death','burial','relics','founded','council','icon_origin','veneration','pilgrimage','other'];
const types=['saint','feast','icon','church_event','historical_event','relic','church','monastery','shrine'];
function required(value:unknown,name:string):asserts value is string {if(typeof value!=='string'||!value.trim())throw new Error(`${name} required`);}
export function placeRevision(place:Record<string,unknown>){return JSON.stringify(['id','canonical_name','historical_name','modern_name','lat','lon','geo_status'].map(k=>place[k]??null));}
export function planCalendarReview(s:ReviewSnapshot,c:ReviewCommand,actor:string,at:string):Statement[] {
  required(c.requestId,'requestId');required(c.profileId,'profileId');required(c.revision,'revision');required(actor,'reviewer');
  if(c.profileId!==s.profile.id||c.revision!==s.profile.updated_at)throw new Error('Stale profile');
  const statements:Statement[]=[],add=(sql:string,...params:unknown[])=>statements.push({sql,params});
  // A failed guard aborts the entire D1 batch; no partial audit or mutation.
  add('INSERT INTO calendar_geo_review_guard(id,valid) VALUES (?,CASE WHEN EXISTS(SELECT 1 FROM calendar_geo_profiles WHERE id=? AND updated_at=?) THEN 1 ELSE 0 END)',c.requestId,c.profileId,c.revision);
  if(s.databaseRevision!==undefined)add('INSERT INTO calendar_geo_review_guard(id,valid) VALUES (?,CASE WHEN (SELECT revision FROM calendar_geo_revision WHERE id=1)=? THEN 1 ELSE 0 END)',`${c.requestId}:revision`,s.databaseRevision);
  const id=s.profile.entity_id;
  if(c.action==='confirm'||c.action==='reject') {
    if(!c.qid||!/^Q\d+$/.test(c.qid)||!s.candidate)throw new Error('Preview a candidate before confirming or rejecting');
    if(c.action==='confirm') {
      if(s.entity?.wikidata_id&&s.entity.wikidata_id!==c.qid)throw new Error('Existing QID conflict: reject or merge explicitly');
      if(s.target&&s.target.id!==id&&id)throw new Error('QID already belongs to another entity; use merge preview');
      const canonical=String(s.target?.id??id??`wd:${c.qid}`);
      const profile=JSON.parse(s.profile.profile_json) as {names:string[]};
      const type=c.entityType??String(s.entity?.entity_type??'');if(!types.includes(type))throw new Error('Choose entity type');
      add("INSERT INTO calendar_geo_entities(id,entity_type,canonical_name,wikidata_id,match_status,identity_profile) VALUES (?,?,?,?,'reviewed_verified',?) ON CONFLICT(id) DO UPDATE SET wikidata_id=excluded.wikidata_id,entity_type=excluded.entity_type,match_status='reviewed_verified'",canonical,type,profile.names[0],c.qid,s.profile.profile_json);
      add("UPDATE calendar_geo_profile_candidates SET status=CASE WHEN qid=? THEN 'confirmed' WHEN status='confirmed' THEN 'needs_review' ELSE status END WHERE profile_id=?",c.qid,c.profileId);
      add("UPDATE calendar_geo_profiles SET entity_id=?,match_status='reviewed_verified',enrichment_status='pending' WHERE id=?",canonical,c.profileId);
      add('UPDATE calendar_geo_rules SET entity_id=? WHERE id IN (SELECT rule_id FROM calendar_geo_rule_profiles WHERE profile_id=?)',canonical,c.profileId);
      add("INSERT INTO calendar_geo_sources(id,source_type,source_url,external_id,retrieved_at,attribution) VALUES (?,'manual',?,?,?,?)",`review:${c.requestId}`,`https://www.wikidata.org/wiki/${c.qid}`,c.qid,at,actor);
      add('INSERT INTO calendar_geo_provenance(id,entity_id,field_name,source_id,value_json) VALUES (?,?,?,?,?)',`review:${c.requestId}`,canonical,'reviewed_identity',`review:${c.requestId}`,JSON.stringify({qid:c.qid,reviewer:actor,at,reason:c.reason??'',machineConfidence:s.candidate.confidence}));
    } else {
      add("UPDATE calendar_geo_profile_candidates SET status='rejected' WHERE profile_id=? AND qid=?",c.profileId,c.qid);
      if(!s.entity?.wikidata_id||s.entity.wikidata_id===c.qid)add("UPDATE calendar_geo_profiles SET match_status='reviewed_rejected',enrichment_status='complete' WHERE id=?",c.profileId);
      if(id&&s.entity?.wikidata_id===c.qid){
        if((s.otherProfiles??0)>0){
          add('UPDATE calendar_geo_profiles SET entity_id=NULL WHERE id=?',c.profileId);
          add('UPDATE calendar_geo_rules SET entity_id=NULL WHERE id IN (SELECT rule_id FROM calendar_geo_rule_profiles WHERE profile_id=?)',c.profileId);
        }else{
          add("UPDATE calendar_geo_entities SET match_status='reviewed_rejected',wikidata_id=NULL,geo_status='unknown' WHERE id=?",id);
          add("UPDATE calendar_geo_relations SET match_status='reviewed_rejected',geo_status='reviewed_rejected' WHERE entity_id=?",id);
        }
      }
    }
  } else if(c.action==='manual_place'||c.action==='edit_place') {
    if(!id)throw new Error('Confirm identity before adding a place');
    required(c.name,'name');if(!relations.includes(c.relationType??''))throw new Error('Invalid relation');
    if(!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||Math.abs(c.lat!)>90||Math.abs(c.lon!)>180)throw new Error('Invalid coordinates');
    if(!['reviewed_verified','manual_unverified','needs_review'].includes(c.geoStatus??''))throw new Error('Invalid geo status');
    let url='';if(c.sourceUrl){const parsed=new URL(c.sourceUrl);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Invalid source URL');url=parsed.href;}
    if(c.geoStatus!=='manual_unverified'&&(!url||!c.sourceNote?.trim()))throw new Error('Source URL and source note required');
    const pid=c.action==='edit_place'?c.placeId:`manual:${c.requestId}`;
    if(!pid||(c.action==='edit_place'&&!s.place))throw new Error('Unknown place');
    if(c.action==='edit_place'&&c.placeRevision!==placeRevision(s.place!))throw new Error('Stale place; reload before editing');
    const match=c.geoStatus==='reviewed_verified'?'reviewed_verified':'needs_review',sid=`review:${c.requestId}`;
    add("INSERT INTO calendar_geo_sources(id,source_type,source_url,retrieved_at,attribution) VALUES (?,'manual',?,?,?)",sid,url,at,`${actor}: ${c.sourceNote??'Manual unverified'}`);
    if(c.action==='manual_place')add("INSERT INTO calendar_geo_places(id,canonical_name,historical_name,modern_name,lat,lon,place_type,match_status,geo_status,verification_status) VALUES (?,?,?,?,?,?,'other',?,?,?)",pid,c.name,c.historicalName??null,c.modernName??null,c.lat,c.lon,match,c.geoStatus,c.geoStatus==='reviewed_verified'?'verified':'needs_review');
    else add('UPDATE calendar_geo_places SET canonical_name=?,historical_name=?,modern_name=?,lat=?,lon=?,match_status=?,geo_status=?,verification_status=? WHERE id=?',c.name,c.historicalName??null,c.modernName??null,c.lat,c.lon,match,c.geoStatus,c.geoStatus==='reviewed_verified'?'verified':'needs_review',pid);
    add('INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id,match_status,geo_status) VALUES (?,?,?,?,?,?) ON CONFLICT(entity_id,place_id,relation_type) DO UPDATE SET source_id=excluded.source_id,match_status=excluded.match_status,geo_status=excluded.geo_status',id,pid,c.relationType,sid,match,c.geoStatus);
    if(c.action==='edit_place'&&c.originalRelationType&&c.originalRelationType!==c.relationType){
      if(!relations.includes(c.originalRelationType))throw new Error('Invalid original relation');
      add("UPDATE calendar_geo_relations SET match_status='reviewed_rejected',geo_status='reviewed_rejected' WHERE entity_id=? AND place_id=? AND relation_type=?",id,pid,c.originalRelationType);
    }
    add('INSERT INTO calendar_geo_provenance(id,place_id,field_name,source_id,value_json) VALUES (?,?,?,?,?)',sid,pid,'manual_coordinates',sid,JSON.stringify({lat:c.lat,lon:c.lon,note:c.sourceNote??'',status:c.geoStatus,reviewer:actor}));
    add('UPDATE calendar_geo_entities SET geo_status=? WHERE id=?',c.geoStatus,id);
  } else if(c.action==='remove_relation') {
    if(!id||!c.placeId||!relations.includes(c.relationType??''))throw new Error('Relation required');
    // Retain the relation as a rejection tombstone so future imports cannot recreate it.
    add("UPDATE calendar_geo_relations SET match_status='reviewed_rejected',geo_status='reviewed_rejected' WHERE entity_id=? AND place_id=? AND relation_type=?",id,c.placeId,c.relationType);
  } else if(c.action==='geo_unknown') {
    if(!id)throw new Error('Entity required');
    add("UPDATE calendar_geo_entities SET geo_status='unknown' WHERE id=?",id);
    add("UPDATE calendar_geo_relations SET geo_status='unknown',match_status='reviewed_rejected' WHERE entity_id=?",id);
  } else if(c.action==='merge') {
    if(!id||!s.target||s.target.id===id)throw new Error('Two different entities required');
    if(s.entity?.wikidata_id&&s.target.wikidata_id&&s.entity.wikidata_id!==s.target.wikidata_id)throw new Error('Conflicting QIDs cannot be merged');
    const target=String(s.target.id);
    add('INSERT INTO calendar_geo_review_guard(id,valid) VALUES (?,CASE WHEN NOT EXISTS(SELECT 1 FROM calendar_geo_entity_redirects WHERE old_id IN (?,?)) THEN 1 ELSE 0 END)',`${c.requestId}:merge`,id,target);
    add('UPDATE calendar_geo_entities SET wikidata_id=NULL WHERE id=?',id);
    if(s.entity?.wikidata_id&&!s.target.wikidata_id)add('UPDATE calendar_geo_entities SET wikidata_id=? WHERE id=?',s.entity.wikidata_id,target);
    add('INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id,verification_status,match_status,geo_status) SELECT ?,place_id,relation_type,source_id,verification_status,match_status,geo_status FROM calendar_geo_relations WHERE entity_id=? ON CONFLICT DO NOTHING',target,id);
    add('INSERT INTO calendar_geo_content_links(entity_id,content_type,translation_group_id) SELECT ?,content_type,translation_group_id FROM calendar_geo_content_links WHERE entity_id=? ON CONFLICT DO NOTHING',target,id);
    add('UPDATE calendar_geo_provenance SET entity_id=? WHERE entity_id=?',target,id);
    add('UPDATE calendar_geo_images SET entity_id=? WHERE entity_id=?',target,id);
    // Conflicting translations are retained on the archived source; audit contains both snapshots.
    add('UPDATE calendar_geo_translations SET entity_id=? WHERE entity_id=? AND locale NOT IN (SELECT locale FROM calendar_geo_translations WHERE entity_id=?)',target,id,target);
    add('UPDATE calendar_geo_rules SET entity_id=? WHERE entity_id=?',target,id);
    add('UPDATE calendar_geo_profiles SET entity_id=?,updated_at=? WHERE entity_id=?',target,at,id);
    add('INSERT INTO calendar_geo_entity_redirects(old_id,canonical_id,reviewed_at,reviewed_by) VALUES (?,?,?,?)',id,target,at,actor);
    add("UPDATE calendar_geo_entities SET match_status='reviewed_rejected' WHERE id=?",id);
    add('DELETE FROM calendar_geo_review_guard WHERE id=?',`${c.requestId}:merge`);
  } else throw new Error('Unknown action');
  add('UPDATE calendar_geo_profiles SET updated_at=? WHERE id=?',at,c.profileId);
  add('INSERT INTO calendar_geo_review_log(id,target_type,target_id,action,before_json,after_json,reviewed_by,reviewed_at) VALUES (?,\'profile\',?,?,?,?,?,?)',c.requestId,c.profileId,c.action,JSON.stringify(s),JSON.stringify(c),actor,at);
  add('DELETE FROM calendar_geo_review_guard WHERE id=?',c.requestId);
  add('DELETE FROM calendar_geo_review_guard WHERE id=?',`${c.requestId}:revision`);
  return statements;
}
