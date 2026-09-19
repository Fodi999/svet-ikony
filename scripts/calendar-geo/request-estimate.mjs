import {pathToFileURL} from 'node:url';
import {openLocalStore} from './local-store.mjs';
import {yearProfiles} from './pass-store.mjs';
import {identityComplete,profileForSearch} from './identity-pass.mjs';
import {values,placeProperties} from './entity-data.mjs';
export function estimateRequests(db,year=2026){
  const urls=new Map(),entities=new Map(),candidateIds=new Set();
  for(const row of db.prepare('SELECT payload_json FROM calendar_geo_http_cache').all()){
    const item=JSON.parse(row.payload_json);
    if(!item.body||item.body.error||!item.url)continue;
    urls.set(item.url,item);
    for(const [id,e] of Object.entries(item.body.entities??{}))if(!('missing'in e))entities.set(id,e);
    for(const hit of item.body.search??[])if(/^Q\d+$/.test(hit.id))candidateIds.add(hit.id);
  }
  const counts={search:0,entities:0,extlinks:0,wikipedia:0,commons:0,other:0};
  for(const url of urls.keys()){
    const p=new URL(url).searchParams,action=p.get('action'),prop=p.get('prop');
    counts[action==='wbsearchentities'?'search':action==='wbgetentities'?'entities':prop==='extlinks'?'extlinks':prop==='extracts|info'?'wikipedia':prop==='imageinfo'?'commons':'other']++;
  }
  const placeIds=new Set([...entities.values()].filter(e=>candidateIds.has(e.id)).flatMap(e=>placeProperties.flatMap(p=>values(e,p).map(v=>v.id))));
  const buckets={candidate:0,place:0,administrative:0};
  for(const id of entities.keys())buckets[candidateIds.has(id)?'candidate':placeIds.has(id)?'place':'administrative']++;
  const batches=Object.fromEntries(Object.entries(buckets).map(([key,n])=>[key,Math.ceil(n/50)]));
  const old=urls.size,newIdentity=counts.search+batches.candidate;
  const newFull=newIdentity+batches.place+batches.administrative+counts.wikipedia+counts.commons+counts.other;
  const profiles=yearProfiles(db,year),done=profiles.filter(p=>identityComplete(db,p)).length,remaining=profiles.length-done;
  const aliasQueries=new Set(profiles.filter(p=>!identityComplete(db,p)).flatMap(p=>profileForSearch(db,p).forms.map(f=>JSON.stringify(f))));
  const warmQueries=new Set([...urls].flatMap(([url,item])=>{
    const p=new URL(url).searchParams;
    if(p.get('action')!=='wbsearchentities'||!Array.isArray(item.body.search))return [];
    if(!item.body.search.length&&Date.now()-Date.parse(item.retrievedAt)>=30*86400000)return [];
    return [JSON.stringify({search:p.get('search'),language:p.get('language')})];
  }));
  const searchBudget=[...aliasQueries].filter(q=>!warmQueries.has(q)).length;
  const projectedOld=searchBudget+Math.ceil(remaining*(old-counts.search)/done);
  const projectedNew=searchBudget+Math.ceil(remaining*(newFull-counts.search)/done);
  const metrics=Object.fromEntries(db.prepare('SELECT * FROM calendar_geo_metrics').all().map(r=>[r.name,r.value]));
  // Instrumentation began at the user-accepted 79-profile checkpoint, not at profile zero.
  const measuredProfiles=Math.max(0,done-79),retries=(metrics.maxlagRetries??0)+(metrics.rateLimitRetries??0)+(metrics.transientRetries??0);
  return {basis:'Replay of unique successful local cache URLs. Includes partially searched next profile. Projection, NOT a throughput benchmark.',
    completed:done,total:profiles.length,remaining,capturedSuccessfulRequests:old,counts,uniqueQids:buckets,batchesOf50:batches,
    replayNewIdentityRequests:newIdentity,replayNewFullRequests:newFull,
    projectedOldRemainingRequests:projectedOld,projectedNewRemainingRequests:projectedNew,
    projectedReductionPercent:+(100*(1-projectedNew/projectedOld)).toFixed(2),remainingUniqueAllowedAliasQueries:aliasQueries.size,remainingUncachedAliasQueries:searchBudget,
    baseline:{metricsStartCompleted:79,measuredProfiles,httpRequests:metrics.networkRequests??0,retries,
      requestsPerProfile:measuredProfiles?(metrics.networkRequests??0)/measuredProfiles:null,
      productiveRequestsPerProfile:measuredProfiles?((metrics.networkRequests??0)-retries)/measuredProfiles:null},
    caveats:['Retry counts and upstream waiting cannot be predicted.','New identity uses no live Wikipedia corroboration; unproven candidates remain REVIEW, not weaker HIGH.',
      'Batch chunk/wave boundaries can require more requests than globally packed replay; existing warm cache can require fewer.',
      'Remaining profile candidate rates/alias counts may differ from this prefix; model is an empirical estimate, not a guarantee.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const db=await openLocalStore();try{console.log(JSON.stringify(estimateRequests(db),null,2));}finally{db.close();}}
