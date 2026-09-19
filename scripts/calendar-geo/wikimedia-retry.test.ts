import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
it('handles maxlag, Retry-After, HTTP throttles, timeouts, negative TTL and QID batching',()=>{
 const out=execFileSync(process.execPath,['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {createWikimediaClient,retryAfterMs,WikimediaPermanentError} from './scripts/calendar-geo/wikimedia-client.mjs';
 assert.equal(retryAfterMs('17',0),17000);assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:20 GMT',0),20000);
 const map=new Map(),waits=[],events=[];let now=0,calls=0;
 const cache={get:k=>map.get(k),set:(k,v)=>map.set(k,v)};
 const client=createWikimediaClient({cache,now:()=>now,random:()=>0,sleep:async ms=>{waits.push(ms);now+=ms},onEvent:e=>events.push(e),fetcher:async(url,options)=>{
   assert.match(options.headers['User-Agent'],/^SvetIkonyCalendarGeo/);assert.equal(url.searchParams.get('maxlag'),'5');calls++;
   if(calls===1)return Response.json({error:{code:'maxlag',lag:7,info:'lagged'}},{headers:{'Retry-After':'60'}});
   if(calls===2)return new Response('',{status:429,headers:{'Retry-After':'10'}});
   if(calls===3)return new Response('',{status:503});
   if(calls===4)return new Response('',{status:502});
   if(calls===5)return new Response('',{status:504});
   if(calls===6)throw new DOMException('timeout','TimeoutError');
   return Response.json({search:[]});
 }});
 await client.get('www.wikidata.org',{action:'wbsearchentities',search:'test'});assert.equal(calls,7);assert.ok(waits.includes(60000));assert.equal(client.stats.maxlagRetries,1);assert.equal(client.stats.rateLimitRetries,1);
 await client.get('www.wikidata.org',{action:'wbsearchentities',search:'test'});assert.equal(calls,7);
 now+=31*86400000;await client.get('www.wikidata.org',{action:'wbsearchentities',search:'test'});assert.equal(calls,8);
 const restart=createWikimediaClient({cache,now:()=>now,sleep:async()=>{},fetcher:()=>{throw new Error('cache missed')}});await restart.get('www.wikidata.org',{action:'wbsearchentities',search:'test'});
 let batches=0;const batch=createWikimediaClient({cache,sleep:async()=>{},fetcher:async url=>{batches++;assert.equal(url.searchParams.get('languages'),'uk|ru|en');return Response.json({entities:Object.fromEntries(url.searchParams.get('ids').split('|').map(id=>[id,{id}]))})}});
 const params={action:'wbgetentities',props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en'};
 await batch.get('www.wikidata.org',{...params,ids:'Q1|Q2'});await batch.get('www.wikidata.org',{...params,ids:'Q2'});await batch.get('www.wikidata.org',{...params,ids:'Q2|Q3'});assert.equal(batches,2);
 const permanent=createWikimediaClient({cache,sleep:async()=>{},fetcher:async()=>new Response('',{status:403})});await assert.rejects(()=>permanent.get('www.wikidata.org',{action:'query'}),WikimediaPermanentError);
 const interrupted=createWikimediaClient({cache,attempts:1,now:()=>now,random:()=>0,sleep:async ms=>{now+=ms},fetcher:async()=>Response.json({error:{code:'maxlag'}},{headers:{'Retry-After':'120'}})});
 await assert.rejects(()=>interrupted.get('www.wikidata.org',{action:'wbsearchentities',search:'restart-cooldown'}));
 const before=now,resumed=createWikimediaClient({cache,now:()=>now,sleep:async ms=>{now+=ms},fetcher:async()=>{assert.ok(now-before>=120000);return Response.json({search:[]})}});
 await resumed.get('www.wikidata.org',{action:'wbsearchentities',search:'restart-cooldown'});
 console.log('PASS');
 `],{encoding:'utf8'});expect(out.trim()).toBe('PASS');
});
