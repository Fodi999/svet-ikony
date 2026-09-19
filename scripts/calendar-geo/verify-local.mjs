import {openLocalStore} from './local-store.mjs';
import assert from 'node:assert/strict';
const base=new URL(process.argv[2]??'http://localhost:3000');
if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Local HTTP only');
const db=await openLocalStore();
try {
 const dates=new Set(['2026-01-14','2026-04-12','2026-09-18']);
 const busiest=db.prepare("SELECT civil_date,count(*) count FROM calendar_geo_occurrences WHERE civil_date LIKE '2026-%' GROUP BY civil_date ORDER BY count DESC LIMIT 1").get();
 if(busiest)dates.add(busiest.civil_date);
 const geographic=db.prepare("SELECT o.civil_date,count(DISTINCT p.id) count FROM calendar_geo_occurrences o JOIN calendar_geo_rules r ON r.id=o.rule_id JOIN calendar_geo_relations rel ON rel.entity_id=r.entity_id JOIN calendar_geo_places p ON p.id=rel.place_id WHERE o.civil_date LIKE '2026-%' AND p.lat IS NOT NULL GROUP BY o.civil_date ORDER BY count DESC LIMIT 1").get();
 if(geographic)dates.add(geographic.civil_date);
 let seed=2026;for(let i=0;i<20;i++){seed=(1664525*seed+1013904223)>>>0;dates.add(new Date(Date.UTC(2026,0,1+seed%365)).toISOString().slice(0,10));}
 const measurements=[];
 for(const date of dates){
   let expected;
   for(const locale of ['uk','ru','en']){
     const start=performance.now();
     const response=await fetch(new URL('/api/calendar/geo?'+new URLSearchParams({date,locale}),base),{signal:AbortSignal.timeout(30000)});
     assert.equal(response.status,200);const raw=await response.text(),body=JSON.parse(raw);
     assert.equal(body.entries.length,body.commemorations,'All commemorations must appear without requiring geo');
     assert.equal(new Set(body.entries.map(entry=>entry.id)).size,body.entries.length);
     if(body.entries.length){
       const entry=body.entries.find(entry=>!entry.hasGeo)??body.entries[0];
       const card=await fetch(new URL(`/api/calendar/entry/${encodeURIComponent(entry.id)}?locale=${locale}`,base));
       assert.equal(card.status,200);const detail=await card.json();assert.ok(detail.title);assert.ok(Array.isArray(detail.places));
     }
     const keys=body.items.map(i=>[i.entityId,i.placeId,i.relationType].join(':')).sort();
     assert.equal(new Set(keys).size,keys.length,'Duplicate entity/place/relation payload');
     if(expected)assert.deepEqual(keys,expected);expected=keys;
     for(const point of body.items){
       assert.ok(Number.isFinite(point.lat)&&Number.isFinite(point.lon));assert.ok(Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180);
       assert.equal(point.biography,undefined);assert.equal(point.summary,undefined);
     }
     measurements.push({date,locale,commemorations:body.commemorations,points:body.items.length,bytes:Buffer.byteLength(raw),ms:Math.round(performance.now()-start)});
   }
 }
 console.log(JSON.stringify({dates:dates.size,requests:measurements.length,busiestCalendarDay:busiest,mostGeographicDay:geographic,
   maxBytes:Math.max(...measurements.map(m=>m.bytes)),maxMs:Math.max(...measurements.map(m=>m.ms)),
   profiles:db.prepare('SELECT enrichment_status,count(*) count FROM calendar_geo_profiles GROUP BY enrichment_status').all(),
   checks:'PASS for current local checkpoint, not full-year completion',measurements},null,2));
}finally{db.close();}
