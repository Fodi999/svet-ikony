import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const hosts=new Set(['www.wikidata.org','uk.wikipedia.org','ru.wikipedia.org','en.wikipedia.org','commons.wikimedia.org']);
export class WikimediaUnavailable extends Error {}
export class WikimediaPermanentError extends Error {}
export function retryAfterMs(value,now=Date.now()) {
  if(!value)return 0;
  const ms=/^\d+(?:\.\d+)?$/.test(value)?Number(value)*1000:Date.parse(value)-now;
  return Number.isFinite(ms)?Math.max(0,ms):0;
}
function identity(host,params){
  const url=new URL(`https://${host}/w/api.php`);
  for(const [key,value] of Object.entries({...params,format:'json',maxlag:'5'}).sort())url.searchParams.set(key,String(value));
  return {url,key:createHash('sha256').update(url.href).digest('hex')};
}

export function createWikimediaClient({cache,fetcher=fetch,sleep,signal,now=()=>Date.now(),attempts=Infinity,random=Math.random,onEvent=()=>{},negativeTtlMs=30*86400000}) {
  const pause=sleep??(ms=>delay(ms,undefined,{signal}));
  let queue=Promise.resolve(),last=0,spacing=1000,successes=0;
  const stats={cacheHits:0,networkRequests:0,maxlagRetries:0,rateLimitRetries:0,transientRetries:0};
  function event(kind,detail={}){onEvent({kind,...detail,stats:{...stats}});}
  async function cached(key){
    const hit=await cache.get(key);if(!hit)return null;
    const negative=hit.negative??(Array.isArray(hit.body?.search)&&hit.body.search.length===0);
    if(negative&&(!Number.isFinite(Date.parse(hit.retrievedAt))||now()-Date.parse(hit.retrievedAt)>=negativeTtlMs))return null;
    if(hit.cacheVersion!==undefined&&hit.cacheVersion!==1)return null;
    stats.cacheHits++;event('cache_hit');return hit;
  }
  async function request(host,params) {
    signal?.throwIfAborted();
    if(!hosts.has(host)) throw new WikimediaPermanentError('Unsupported Wikimedia host');
    if(!['query','wbsearchentities','wbgetentities'].includes(params.action)) throw new WikimediaPermanentError('Read-only API required');
    const {url,key}=identity(host,params);
    const hit=await cached(key);
    if(hit) return hit;
    const cooldownKey=`wikimedia-cooldown:${host}`;
    const cooldown=await cache.get(cooldownKey);
    const retryNumber=Number.isSafeInteger(cooldown?.retryNumber)?cooldown.retryNumber:0;
    if(cooldown?.nextRequestAt>now())await pause(cooldown.nextRequestAt-now());
    if(Number.isFinite(cooldown?.spacing))spacing=Math.max(spacing,Math.min(15000,cooldown.spacing));
    let failure;
    for(let attempt=0;attempt<attempts;attempt++) {
      await pause(Math.max(0,spacing-(now()-last))); last=now();
      let retryMs=0,code='network',lag=null,info='';
      try {
        stats.networkRequests++;event('request',{host});
        const timeout=AbortSignal.timeout(30000);
        const response=await fetcher(url,{headers:{'User-Agent':'SvetIkonyCalendarGeo/1.0 (https://svetikony.com)'},signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:'error'});
        retryMs=retryAfterMs(response.headers.get('Retry-After'),now());
        const body=await response.json().catch(()=>null);
        if(response.ok&&!body)throw new Error('Malformed Wikimedia JSON');
        if(response.ok && !body?.error) {
          const result={url:url.href,retrievedAt:new Date(now()).toISOString(),cacheVersion:1,negative:Array.isArray(body.search)&&body.search.length===0,body};
          if(++successes>=10){spacing=Math.max(1000,Math.floor(spacing*0.8));successes=0;}
          await cache.set(cooldownKey,{url:`https://${host}/w/api.php`,retrievedAt:result.retrievedAt,nextRequestAt:0,retryNumber:0,spacing});
          await cache.set(key,result); return result;
        }
        code=[429,502,503,504].includes(response.status)?String(response.status):body?.error?.code??String(response.status);lag=body?.error?.lag??response.headers.get('X-Database-Lag');info=body?.error?.info??'';
        failure=`${code}: ${info}`;
        if(!['maxlag','ratelimited','readonly','429','502','503','504'].includes(code))throw new WikimediaPermanentError(`Wikimedia ${failure}`);
      } catch(error) {
        signal?.throwIfAborted();
        if(error instanceof WikimediaPermanentError)throw error;
        failure=String(error);
      }
      successes=0;spacing=Math.min(15000,spacing*2);
      if(code==='maxlag')stats.maxlagRetries++;else if(code==='429'||code==='ratelimited')stats.rateLimitRetries++;else stats.transientRetries++;
      const backoff=Math.min(300000,5000*2**Math.min(attempt+retryNumber,6));
      const waitMs=Math.max(retryMs,backoff)+Math.floor(random()*Math.min(10000,backoff*0.25));
      await cache.set(cooldownKey,{url:`https://${host}/w/api.php`,retrievedAt:new Date(now()).toISOString(),nextRequestAt:now()+waitMs,retryNumber:Math.min(6,retryNumber+attempt+1),spacing});
      event('retry',{host,code,lag,info,attempt:attempt+1,waitMs});
      if(attempt<attempts-1)await pause(waitMs);
    }
    throw new WikimediaUnavailable(`Wikimedia temporarily unavailable; checkpoint not advanced: ${failure}`);
  }
  async function cachedBatch(host,params){
    if(host!=='www.wikidata.org'||params.action!=='wbgetentities'||!params.ids)return request(host,params);
    const ids=[...new Set(String(params.ids).split('|'))];
    if(ids.some(id=>!/^Q\d+$/.test(id))||ids.length>50)throw new Error('Invalid Wikidata batch');
    const entities={},missing=[];
    for(const id of ids){const hit=await cached(identity(host,{...params,ids:id}).key);if(hit?.body?.entities?.[id])entities[id]=hit.body.entities[id];else missing.push(id);}
    let result={url:identity(host,params).url.href,retrievedAt:new Date(now()).toISOString(),body:{entities}};
    if(missing.length){result=await request(host,{...params,ids:missing.join('|')});
      if(!result.body?.entities)throw new Error('Invalid Wikidata response');
      for(const id of missing){const entity=result.body.entities[id];if(!entity)throw new Error('Missing entity response');entities[id]=entity;
        await cache.set(identity(host,{...params,ids:id}).key,{...result,negative:'missing'in entity,body:{entities:{[id]:entity}}});}
    }
    return {...result,body:{entities}};
  }
  return {stats,get(host,params) {
    const task=queue.then(()=>cachedBatch(host,params));
    queue=task.catch(()=>{}); return task;
  }};
}
