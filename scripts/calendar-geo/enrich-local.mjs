import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {openLocalStore,root,transaction} from './local-store.mjs';
import {createWikimediaClient,WikimediaUnavailable} from './wikimedia-client.mjs';
import {enrichMatched} from './enrichment-data.mjs';
import {searchVariants,isGroupName} from './search-strategy.mjs';
import {progressiveSearch} from './progressive-search.mjs';
import {candidate} from './entity-data.mjs';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('@/')?pathToFileURL(join(root,`${specifier.slice(2)}.ts`)).href:specifier,context);}});
const {selectIdentity,normalizeIdentityName}=await import('../../lib/church/geo-identity.ts');
const args=process.argv.slice(2);
if(!args.includes('--apply') || args.some(arg=>!['--apply','--prepare-only'].includes(arg)&&!/^--year=\d{4}$/.test(arg)))throw new Error('Usage: --apply [--prepare-only] --year=2026. Local only.');
const year=Number(args.find(a=>a.startsWith('--year='))?.slice(7)??new Date().getUTCFullYear());
if(year<1583 || year>4099)throw new Error('Unsupported year');
const db=await openLocalStore();
const now=()=>new Date().toISOString();
try {
  const rules=db.prepare("SELECT DISTINCT r.* FROM calendar_geo_rules r JOIN calendar_geo_occurrences o ON o.rule_id=r.id WHERE o.civil_date BETWEEN ? AND ? ORDER BY r.id").all(`${year}-01-01`,`${year}-12-31`);
  if(!rules.length)throw new Error('Resolve the requested year first');
  transaction(db,()=>{
    const put=db.prepare('INSERT INTO calendar_geo_profiles(id,entity_id,profile_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING');
    const link=db.prepare('INSERT INTO calendar_geo_rule_profiles(rule_id,profile_id) VALUES (?,?) ON CONFLICT DO NOTHING');
    for(const rule of rules){
      const id=`source:${rule.id}`;
      const dates=db.prepare('SELECT civil_date FROM calendar_geo_occurrences WHERE rule_id=? ORDER BY civil_date').all(rule.id).map(r=>r.civil_date);
      // A day-page URL is shared by multiple people and cannot establish identity.
      const profile={names:[rule.source_title],sourceUrls:[],calendarDates:dates,
        sourceReferences:[rule.source_id],group:/\b(Martyrs|Saints|Synaxis|companions)\b/i.test(rule.source_title)};
      put.run(id,rule.entity_id,JSON.stringify(profile),now());link.run(rule.id,id);
    }
    const internal=db.prepare('SELECT * FROM church_saints ORDER BY translation_group_id,language').all();
    const groups=Map.groupBy(internal,row=>row.translation_group_id);
    for(const [group,rows] of groups){
      const id=`internal:saint:${group}`;
      const names=rows.map(row=>row.name);
      const profile={names,biography:rows.map(row=>row.biography).filter(Boolean).join('\n'),sourceUrls:[],calendarDates:[...new Set(rows.map(row=>row.feast_day_old_style).filter(Boolean))],translationGroup:group,
        group:rows.some(row=>/Мученики|Мучениці|Мученицы|Martyrs|Saints/i.test(row.name))};
      db.prepare("INSERT INTO calendar_geo_entities(id,entity_type,canonical_name,identity_profile) VALUES (?,'saint',?,?) ON CONFLICT(id) DO NOTHING").run(id,names[0],JSON.stringify(profile));
      db.prepare("INSERT INTO calendar_geo_content_links(entity_id,content_type,translation_group_id) VALUES (?,'saint',?) ON CONFLICT DO NOTHING").run(id,group);
      put.run(id,id,JSON.stringify(profile),now());
    }
  });
  const profiles=db.prepare('SELECT DISTINCT p.* FROM calendar_geo_profiles p LEFT JOIN calendar_geo_rule_profiles rp ON rp.profile_id=p.id LEFT JOIN calendar_geo_occurrences o ON o.rule_id=rp.rule_id WHERE (o.civil_date BETWEEN ? AND ?) OR p.id LIKE ? ORDER BY p.id').all(`${year}-01-01`,`${year}-12-31`,'internal:saint:%');
  const names=new Map();
  for(const p of profiles){const key=normalizeIdentityName(JSON.parse(p.profile_json).names[0]);names.set(key,[...(names.get(key)??[]),p.id]);}
  console.log(JSON.stringify({year,commemorations:rules.length,identityProfiles:profiles.length,internalTranslationGroups:profiles.filter(p=>p.id.startsWith('internal:')).length,duplicateNameGroups:[...names.values()].filter(v=>v.length>1).length,note:'Profiles are not asserted unique canonical entities; names alone are never merged.'}));
  if(!args.includes('--prepare-only')) {
    const cache={get:key=>{const row=db.prepare('SELECT payload_json FROM calendar_geo_http_cache WHERE cache_key=?').get(key);return row?JSON.parse(row.payload_json):null;},
      set:(key,value)=>db.prepare('INSERT INTO calendar_geo_http_cache(cache_key,url,retrieved_at,payload_json) VALUES (?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET retrieved_at=excluded.retrieved_at,payload_json=excluded.payload_json').run(key,value.url,value.retrievedAt,JSON.stringify(value))};
    // Preserve the in-flight backoff from checkpoints created before client cooldown persistence.
    const waiting=db.prepare("SELECT detail_json FROM calendar_geo_stages WHERE status='retry' AND json_extract(detail_json,'$.code')='maxlag' ORDER BY updated_at DESC LIMIT 1").get();
    const nextRequestAt=waiting?Date.parse(JSON.parse(waiting.detail_json).nextRetryAt):0;
    if(nextRequestAt>Date.now()&&!cache.get('wikimedia-cooldown:www.wikidata.org'))cache.set('wikimedia-cooldown:www.wikidata.org',{url:'https://www.wikidata.org/w/api.php',retrievedAt:now(),nextRequestAt,retryNumber:6,spacing:15000});
    let activeProfile=null;
    const client=createWikimediaClient({cache,onEvent(event){
      const metric=event.kind==='request'?'networkRequests':event.kind==='cache_hit'?'cacheHits':event.kind==='retry'?(event.code==='maxlag'?'maxlagRetries':event.code==='429'?'rateLimitRetries':'transientRetries'):null;
      if(metric)db.prepare('INSERT INTO calendar_geo_metrics(name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=value+1').run(metric);
      if(event.kind==='retry'){
        console.log(JSON.stringify(event));
        if(activeProfile)db.prepare("UPDATE calendar_geo_stages SET status='retry',detail_json=?,updated_at=? WHERE profile_id=? AND status IN ('running','retry')").run(JSON.stringify({code:event.code,lag:event.lag,info:event.info,nextRetryAt:new Date(Date.now()+event.waitMs).toISOString()}),now(),activeProfile);
      }
    }});
    for(let index=0;index<profiles.length;index++) {
      const row=db.prepare('SELECT * FROM calendar_geo_profiles WHERE id=?').get(profiles[index].id);
      if(row.match_status==='reviewed_rejected')continue;
      if(row.match_status==='reviewed_verified'&&row.enrichment_status==='complete')continue;
      const profile=JSON.parse(row.profile_json);
      if(row.enrichment_status==='complete'&&profile.completedSearchVersion>=2)continue;
      profile.ocaId=row.id.match(/^source:oca-fixed:\d{2}-\d{2}:(\d+)$/)?.[1];
      profile.group=profile.group||profile.names.some(isGroupName);
      if(row.id.startsWith('internal:'))profile.nameLocales=Object.fromEntries(db.prepare('SELECT name,language FROM church_saints WHERE translation_group_id=?').all(profile.translationGroup).map(s=>[s.name,s.language]));
      const forms=searchVariants(profile);
      profile.names=[...new Set(forms.map(form=>form.search))];
      profile.nameLocales=Object.fromEntries(forms.map(form=>[form.search,form.language]));
      try {
        activeProfile=row.id;
        const confirmed=row.match_status==='reviewed_verified'?db.prepare("SELECT qid FROM calendar_geo_profile_candidates WHERE profile_id=? AND status='confirmed'").get(row.id):null;
        const savedMatch=row.match_status==='machine_high'?db.prepare("SELECT detail_json FROM calendar_geo_stages WHERE profile_id=? AND stage='matching' AND status='complete'").get(row.id):null;
        const resumeQid=confirmed?.qid??(savedMatch?JSON.parse(savedMatch.detail_json).qid:null);
        if(resumeQid){
          db.prepare("INSERT INTO calendar_geo_stages(profile_id,stage,status,detail_json,updated_at) VALUES (?,'matching','complete',?,?) ON CONFLICT(profile_id,stage) DO UPDATE SET status='complete',detail_json=excluded.detail_json,updated_at=excluded.updated_at").run(row.id,JSON.stringify({qid:resumeQid,reviewed:Boolean(confirmed)}),now());
          const response=await client.get('www.wikidata.org',{action:'wbgetentities',ids:resumeQid,props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en'});
          const entity=response.body.entities?.[resumeQid];if(!entity||'missing'in entity)throw new Error('Matched QID unavailable');
          await enrichMatched(db,client,row,entity);
          db.prepare("UPDATE calendar_geo_profiles SET enrichment_status='complete',error=NULL,updated_at=? WHERE id=?").run(now(),row.id);continue;
        }
        db.prepare("INSERT INTO calendar_geo_stages(profile_id,stage,status,updated_at) VALUES (?,'matching','running',?) ON CONFLICT(profile_id,stage) DO UPDATE SET status='running',updated_at=excluded.updated_at").run(row.id,now());
        const rejected=new Set(db.prepare("SELECT qid FROM calendar_geo_profile_candidates WHERE profile_id=? AND status='rejected'").all(row.id).map(r=>r.qid));
        const candidates=[],rawEntities={};
        const {match,searches}=await progressiveSearch(searchVariants(profile),async variant=>{
          const search=await client.get('www.wikidata.org',{action:'wbsearchentities',...variant,limit:5,type:'item'});
          if(!Array.isArray(search.body.search))throw new Error('Malformed Wikidata search response');
          return search.body.search.map(hit=>hit.id).filter(id=>/^Q\d+$/.test(id)&&!rejected.has(id));
        },async ids=>{
          if(!ids.length)return selectIdentity(profile,candidates);
          const response=await client.get('www.wikidata.org',{action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en'});
          if(!response.body.entities)throw new Error('Malformed entity response');
          Object.assign(rawEntities,response.body.entities);
          const added=Object.values(response.body.entities).filter(e=>!('missing'in e)).map(candidate);
          if(profile.ocaId)for(const item of added){
          const title=rawEntities[item.qid]?.sitelinks?.enwiki?.title;if(!title)continue;
          const links=await client.get('en.wikipedia.org',{action:'query',titles:title,prop:'extlinks',ellimit:500,formatversion:2});
          for(const page of links.body.query?.pages??[])for(const link of page.extlinks??[])if(typeof link.url==='string')item.referenceUrls.push(link.url);
          }
          candidates.push(...added);return selectIdentity(profile,candidates);
        });
        profile.searches=searches;
        const fresh=db.prepare('SELECT updated_at FROM calendar_geo_profiles WHERE id=?').get(row.id);
        if(fresh.updated_at!==row.updated_at)throw new Error('Profile reviewed during matching; resume from fresh checkpoint');
        db.prepare("INSERT INTO calendar_geo_stages(profile_id,stage,status,detail_json,updated_at) VALUES (?,'matching','complete',?,?) ON CONFLICT(profile_id,stage) DO UPDATE SET status='complete',detail_json=excluded.detail_json,updated_at=excluded.updated_at").run(row.id,JSON.stringify(match),now());
        transaction(db,()=>{
          for(const item of match.candidates)db.prepare('INSERT INTO calendar_geo_profile_candidates(profile_id,qid,confidence,evidence_json) VALUES (?,?,?,?) ON CONFLICT(profile_id,qid) DO UPDATE SET confidence=excluded.confidence,evidence_json=excluded.evidence_json WHERE status=\'needs_review\'').run(row.id,item.qid,item.confidence,JSON.stringify({...item.evidence,referenceUrls:candidates.find(c=>c.qid===item.qid)?.referenceUrls??[]}));
          profile.completedSearchVersion=3;
          db.prepare("UPDATE calendar_geo_profiles SET match_status=?,profile_json=?,enrichment_status='complete',error=NULL,updated_at=? WHERE id=? AND match_status NOT IN ('reviewed_verified','reviewed_rejected')").run(match.status,JSON.stringify(profile),now(),row.id);
          if(match.qid)db.prepare("UPDATE calendar_geo_profiles SET enrichment_status='retry' WHERE id=?").run(row.id);
        });
        if(match.qid) {
          db.prepare("UPDATE calendar_geo_profiles SET enrichment_status='retry' WHERE id=?").run(row.id);
          await enrichMatched(db,client,db.prepare('SELECT * FROM calendar_geo_profiles WHERE id=?').get(row.id),rawEntities[match.qid]);
          db.prepare("UPDATE calendar_geo_profiles SET enrichment_status='complete',error=NULL WHERE id=?").run(row.id);
        }else for(const stage of ['entity','wikipedia','places','coordinates','commons','persistence'])db.prepare("INSERT INTO calendar_geo_stages(profile_id,stage,status,detail_json,updated_at) VALUES (?,?,'not_applicable',?,?) ON CONFLICT(profile_id,stage) DO UPDATE SET status='not_applicable',detail_json=excluded.detail_json,updated_at=excluded.updated_at").run(row.id,stage,JSON.stringify({reason:'No automatically verified identity'}),now());
        console.log(`[${index+1}/${profiles.length} profiles] ${row.id} ${match.status}`);
        if((index+1)%100===0)console.log(JSON.stringify({progress:db.prepare('SELECT match_status,enrichment_status,count(*) n FROM calendar_geo_profiles GROUP BY 1,2').all(),places:db.prepare('SELECT count(*) n FROM calendar_geo_places').get().n,relations:db.prepare('SELECT count(*) n FROM calendar_geo_relations').get().n,metrics:db.prepare('SELECT * FROM calendar_geo_metrics').all()}));
      }catch(error){
        db.prepare("UPDATE calendar_geo_stages SET status='retry',detail_json=?,updated_at=? WHERE profile_id=? AND status IN ('running','retry')").run(JSON.stringify({error:String(error)}),now(),row.id);
        db.prepare("UPDATE calendar_geo_profiles SET enrichment_status='retry',error=?,updated_at=? WHERE id=? AND (match_status NOT IN ('reviewed_verified','reviewed_rejected') OR updated_at=?)").run(String(error),now(),row.id,row.updated_at);
        if(error instanceof WikimediaUnavailable)throw error;
        console.error(`Retry later: ${row.id} ${String(error)}`);
      }
    }
  }
  const pending=profiles.filter(p=>db.prepare('SELECT enrichment_status FROM calendar_geo_profiles WHERE id=?').get(p.id).enrichment_status!=='complete').length;
  console.log(JSON.stringify({processed:profiles.length-pending,total:profiles.length,complete:pending===0,statuses:db.prepare('SELECT match_status,enrichment_status,count(*) AS count FROM calendar_geo_profiles GROUP BY match_status,enrichment_status').all(),foreignKeyErrors:db.prepare('PRAGMA foreign_key_check').all().length}));
  if(pending&&!args.includes('--prepare-only'))process.exitCode=1;
}finally{db.close();}
