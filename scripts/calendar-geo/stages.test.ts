import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
it('persists identity and coordinates before a Commons failure and resumes without duplicates',()=>{
 const out=execFileSync(process.execPath,['--input-type=module','-e',`
 import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
 import {enrichMatched} from './scripts/calendar-geo/enrichment-data.mjs';
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE church_calendar_days(id TEXT PRIMARY KEY)');
 for(const file of ['0026_calendar_geo','0027_calendar_geo_identity','0028_calendar_geo_workflow','0029_calendar_geo_review_guard','0030_calendar_geo_revision'])db.exec(readFileSync('migrations/'+file+'.sql','utf8'));
 db.prepare('INSERT INTO calendar_geo_profiles(id,profile_json,updated_at) VALUES (?,?,?)').run('p',JSON.stringify({names:['Fixture']}),'v1');
 const claim=value=>[{mainsnak:{snaktype:'value',datavalue:{value}}}];
 const entity={id:'Q42',labels:{en:{value:'Fixture'}},claims:{P31:claim({id:'Q5'}),P19:claim({id:'Q100'}),P20:claim({id:'Q100'}),P18:claim('Fixture.png')}};
 const place={id:'Q100',labels:{en:{value:'Place'}},claims:{P17:claim({id:'Q200'}),P131:claim({id:'Q201'}),P625:claim({globe:'http://www.wikidata.org/entity/Q2',latitude:40,longitude:20})}};
 let fail=true,placeRequests=0;
 const client={get:async(host,params)=>{
   if(host==='commons.wikimedia.org'){if(fail)throw new Error('simulated Commons outage');return {body:{query:{pages:[]}}};}
   if(params.ids==='Q200|Q201')return {body:{entities:{Q200:{claims:{P297:claim('IT')}},Q201:{labels:{en:{value:'Region'}}}}}};
   placeRequests++;assert.equal(params.ids,'Q100');return {retrievedAt:'2026-09-19',body:{entities:{Q100:place}}};
 }};
 const profile=()=>db.prepare('SELECT * FROM calendar_geo_profiles WHERE id=?').get('p');
 await assert.rejects(()=>enrichMatched(db,client,profile(),entity),/Commons outage/);
 assert.equal(db.prepare('SELECT wikidata_id FROM calendar_geo_entities').get().wikidata_id,'Q42');
 assert.equal(db.prepare('SELECT lat FROM calendar_geo_places').get().lat,40);assert.equal(db.prepare('SELECT count(*) n FROM calendar_geo_relations').get().n,2);
 assert.equal(db.prepare('SELECT country_code FROM calendar_geo_places').get().country_code,'IT');assert.equal(db.prepare('SELECT region FROM calendar_geo_places').get().region,'Region');
 assert.equal(db.prepare("SELECT status FROM calendar_geo_stages WHERE stage='coordinates'").get().status,'complete');
 fail=false;await enrichMatched(db,client,profile(),entity);
 assert.equal(db.prepare('SELECT count(*) n FROM calendar_geo_entities').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM calendar_geo_places').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM calendar_geo_relations').get().n,2);
 assert.equal(placeRequests,2);assert.equal(db.prepare("SELECT status FROM calendar_geo_stages WHERE stage='persistence'").get().status,'complete');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);console.log('PASS');
 `],{encoding:'utf8'});expect(out.trim()).toBe('PASS');
});
