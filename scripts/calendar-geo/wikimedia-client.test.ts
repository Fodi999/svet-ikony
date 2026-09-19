import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
describe('Wikimedia cache and backoff',()=>{
  it('does not cache maxlag or reinterpret it as no-match; reuses successful requests',()=>{
    const out=execFileSync(process.execPath,['--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {createWikimediaClient,WikimediaUnavailable} from './scripts/calendar-geo/wikimedia-client.mjs';
      const store=new Map();let calls=0;
      const cache={get:k=>store.get(k),set:(k,v)=>store.set(k,v)};
      const bad=createWikimediaClient({cache,attempts:2,sleep:async()=>{},fetcher:async()=>{calls++;return new Response(JSON.stringify({error:{code:'maxlag'}}));}});
      await assert.rejects(()=>bad.get('www.wikidata.org',{action:'wbsearchentities',search:'Basil'}),WikimediaUnavailable);
      assert.equal(calls,2);assert.equal([...store.values()].filter(v=>v.body).length,0);
      assert.ok(store.get('wikimedia-cooldown:www.wikidata.org').nextRequestAt>Date.now());
      const good=createWikimediaClient({cache,sleep:async()=>{},fetcher:async()=>{calls++;return new Response(JSON.stringify({search:[]}));}});
      await good.get('www.wikidata.org',{action:'wbsearchentities',search:'Basil'});
      await good.get('www.wikidata.org',{search:'Basil',action:'wbsearchentities'});
      assert.equal(calls,3);assert.equal([...store.values()].filter(v=>v.body).length,1);
      await assert.rejects(()=>good.get('example.com',{action:'query'}));
      await assert.rejects(()=>good.get('www.wikidata.org',{action:'edit'}));
      console.log('PASS');
    `],{encoding:'utf8'});
    expect(out.trim()).toBe('PASS');
  });
});
