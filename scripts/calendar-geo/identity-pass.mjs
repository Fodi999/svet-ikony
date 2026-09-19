import {selectIdentity} from '../../lib/church/geo-identity.ts';
import {transaction} from './local-store.mjs';
import {searchVariants,isGroupName} from './search-strategy.mjs';
import {candidate,fetchEntities} from './entity-data.mjs';
import {enrichMatched} from './enrichment-data.mjs';
const now=()=>new Date().toISOString();
export function putStage(db,id,stage,status,detail={}){
  db.prepare('INSERT INTO calendar_geo_stages(profile_id,stage,status,detail_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(profile_id,stage) DO UPDATE SET status=excluded.status,detail_json=excluded.detail_json,updated_at=excluded.updated_at').run(id,stage,status,JSON.stringify(detail),now());
}
export function identityComplete(db,row){
  return row.match_status==='reviewed_verified'||row.match_status==='reviewed_rejected'||
    (row.enrichment_status==='complete'&&JSON.parse(row.profile_json).completedSearchVersion>=2)||
    Boolean(db.prepare("SELECT 1 FROM calendar_geo_stages WHERE profile_id=? AND stage='matching' AND status='complete'").get(row.id));
}
export function profileForSearch(db,row){
  const profile=JSON.parse(row.profile_json);
  profile.ocaId=row.id.match(/^source:oca-fixed:\d{2}-\d{2}:(\d+)$/)?.[1];
  profile.group=profile.group||profile.names.some(isGroupName);
  if(row.id.startsWith('internal:'))profile.nameLocales=Object.fromEntries(db.prepare('SELECT name,language FROM church_saints WHERE translation_group_id=?').all(profile.translationGroup).map(s=>[s.name,s.language]));
  const forms=searchVariants(profile);
  profile.names=[...new Set(forms.map(f=>f.search))];
  profile.nameLocales=Object.fromEntries(forms.map(f=>[f.search,f.language]));
  return {profile,forms};
}
function cachedReferences(db){
  const result=new Map();
  for(const row of db.prepare("SELECT url,payload_json FROM calendar_geo_http_cache WHERE url LIKE '%prop=extlinks%'").all()){
    const url=new URL(row.url),body=JSON.parse(row.payload_json).body;
    if(url.hostname!=='en.wikipedia.org'||!body?.query?.pages)continue;
    result.set(url.searchParams.get('titles'),body.query.pages.flatMap(page=>(page.extlinks??[]).map(link=>link.url).filter(url=>typeof url==='string')));
  }
  return result;
}
export async function runIdentityChunk(db,client,rows,{onProgress=()=>{}}={}){
  const references=cachedReferences(db),loaded={};
  const states=rows.filter(row=>!identityComplete(db,row)).map(row=>{
    const {profile,forms}=profileForSearch(db,row);
    const saved=db.prepare("SELECT detail_json FROM calendar_geo_stages WHERE profile_id=? AND stage='identity_search'").get(row.id);
    const checkpoint=saved?JSON.parse(saved.detail_json):{};
    const valid=checkpoint.revision===row.updated_at&&checkpoint.version===1;
    putStage(db,row.id,'matching','running');
    return {row,profile,forms,cursor:valid?checkpoint.cursor:0,ids:valid?checkpoint.ids:[],searches:valid?checkpoint.searches:[],done:false,
      rejected:new Set(db.prepare("SELECT qid FROM calendar_geo_profile_candidates WHERE profile_id=? AND status='rejected'").all(row.id).map(c=>c.qid))};
  });
  async function finish(state,match){
    const fresh=db.prepare('SELECT * FROM calendar_geo_profiles WHERE id=?').get(state.row.id);
    if(fresh.updated_at!==state.row.updated_at)throw new Error(`Profile changed during identity pass: ${fresh.id}`);
    const profile={...state.profile,searches:state.searches,completedSearchVersion:4,pipelinePassVersion:1};
    transaction(db,()=>{
      for(const item of match.candidates)db.prepare("INSERT INTO calendar_geo_profile_candidates(profile_id,qid,confidence,evidence_json) VALUES (?,?,?,?) ON CONFLICT(profile_id,qid) DO UPDATE SET confidence=excluded.confidence,evidence_json=excluded.evidence_json WHERE status='needs_review'").run(fresh.id,item.qid,item.confidence,JSON.stringify(item.evidence));
      db.prepare('UPDATE calendar_geo_profiles SET profile_json=?,match_status=?,enrichment_status=?,error=NULL,updated_at=? WHERE id=?').run(JSON.stringify(profile),match.status,match.qid?'pending':'complete',now(),fresh.id);
      putStage(db,fresh.id,'matching','complete',match);
      putStage(db,fresh.id,'identity_search','complete',{version:1,revision:fresh.updated_at,cursor:state.cursor,ids:state.ids,searches:state.searches});
      for(const stage of ['entity','places','coordinates','wikipedia','commons'])putStage(db,fresh.id,stage,match.qid?'pending':'not_applicable',{reason:match.qid?'Deferred pass':'No HIGH identity; no enrichment requests'});
    });
    if(match.qid)await enrichMatched(db,client,db.prepare('SELECT * FROM calendar_geo_profiles WHERE id=?').get(fresh.id),loaded[match.qid],{pass:'identity'});
    state.done=true;onProgress({id:fresh.id,status:match.status});
  }
  while(states.some(s=>!s.done)){
    // One alias wave across the chunk fills multilingual batches across profiles.
    for(const state of states.filter(s=>!s.done)){
      const variant=state.forms[state.cursor];
      if(variant){
        const result=await client.get('www.wikidata.org',{action:'wbsearchentities',...variant,limit:5,type:'item'});
        if(!Array.isArray(result.body.search))throw new Error('Malformed search response');
        state.ids=[...new Set([...state.ids,...result.body.search.map(hit=>hit.id).filter(id=>/^Q\d+$/.test(id)&&!state.rejected.has(id))])];
        state.searches.push({...variant,hits:result.body.search.length});state.cursor++;
        putStage(db,state.row.id,'identity_search','running',{version:1,revision:state.row.updated_at,cursor:state.cursor,ids:state.ids,searches:state.searches});
      }
      if(!state.ids.length&&state.cursor>=state.forms.length)await finish(state,selectIdentity(state.profile,[]));
    }
    const ids=states.filter(s=>!s.done).flatMap(s=>s.ids).filter(id=>!loaded[id]);
    Object.assign(loaded,await fetchEntities(client,ids));
    for(const state of states.filter(s=>!s.done)){
      const candidates=state.ids.map(id=>loaded[id]).filter(e=>e&&!('missing'in e)).map(entity=>{
        const item=candidate(entity);
        item.referenceUrls.push(...(references.get(entity.sitelinks?.enwiki?.title)??[]));
        return item;
      });
      const match=selectIdentity(state.profile,candidates);
      if(match.status==='machine_high'||state.cursor>=state.forms.length)await finish(state,match);
    }
  }
  return states.length;
}
