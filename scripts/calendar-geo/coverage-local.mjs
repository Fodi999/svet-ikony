import {openLocalStore} from './local-store.mjs';
const db=await openLocalStore();
try {
 const all=(sql,...params)=>db.prepare(sql).all(...params),n=sql=>db.prepare(sql).get().n;
 const canonical="NOT EXISTS(SELECT 1 FROM calendar_geo_entity_redirects d WHERE d.old_id=e.id)";
 const credible="e.match_status IN ('machine_high','reviewed_verified') AND r.match_status IN ('machine_high','reviewed_verified') AND r.geo_status IN ('machine_high','reviewed_verified') AND p.geo_status IN ('machine_high','reviewed_verified') AND p.lat IS NOT NULL";
 const entities=n(`SELECT count(*) n FROM calendar_geo_entities e WHERE ${canonical}`),places=n('SELECT count(*) n FROM calendar_geo_places');
 const geo=n(`SELECT count(DISTINCT e.id) n FROM calendar_geo_entities e JOIN calendar_geo_relations r ON r.entity_id=e.id JOIN calendar_geo_places p ON p.id=r.place_id WHERE ${canonical} AND ${credible}`);
 const translations={};
 for(const [owner,denominator] of [['entity',entities],['place',places]]){
   translations[owner]={denominator,locales:{}};
   for(const locale of ['uk','ru','en']){
     const rows=all(`SELECT translation_status,count(*) n FROM calendar_geo_translations t WHERE ${owner}_id IS NOT NULL AND locale=? ${owner==='entity'?'AND NOT EXISTS(SELECT 1 FROM calendar_geo_entity_redirects d WHERE d.old_id=t.entity_id)':''} GROUP BY translation_status`,locale);
     const counts=Object.fromEntries(rows.map(r=>[r.translation_status,r.n]));const native=(counts.source??0)+(counts.verified??0),fallback=counts.fallback??0;
     translations[owner].locales[locale]={native,withFallback:native+fallback,needsReview:counts.needs_review??0,nativePercent:denominator?+(100*native/denominator).toFixed(2):0,withFallbackPercent:denominator?+(100*(native+fallback)/denominator).toFixed(2):0};
   }
 }
 const statuses=all('SELECT match_status,enrichment_status,count(*) n FROM calendar_geo_profiles GROUP BY 1,2');
 console.log(JSON.stringify({
   calendarDays:n("SELECT count(*) n FROM calendar_geo_days WHERE civil_date LIKE '2026-%' AND calendar_system='julian' AND tradition='orthodox' AND jurisdiction=''"),
   commemorations:n("SELECT count(*) n FROM calendar_geo_occurrences WHERE civil_date LIKE '2026-%' AND calendar_system='julian' AND tradition='orthodox' AND jurisdiction=''"),
   rawProfiles:n('SELECT count(*) n FROM calendar_geo_profiles'),processed:n("SELECT count(*) n FROM calendar_geo_profiles WHERE enrichment_status='complete'"),statuses,
   storedCanonicalEntities:entities,canonicalDisclaimer:'Stored reconciled/legacy entities, not a fully reviewed unique count for 2880 commemorations',
   types:all(`SELECT entity_type,count(*) n FROM calendar_geo_entities e WHERE ${canonical} GROUP BY entity_type`),
   places,activeRelations:n(`SELECT count(*) n FROM calendar_geo_relations r JOIN calendar_geo_entities e ON e.id=r.entity_id WHERE ${canonical} AND r.match_status!='reviewed_rejected'`),
   machineHighGeo:n(`SELECT count(DISTINCT e.id) n FROM calendar_geo_entities e JOIN calendar_geo_relations r ON r.entity_id=e.id JOIN calendar_geo_places p ON p.id=r.place_id WHERE ${canonical} AND ${credible} AND (p.geo_status='machine_high' OR r.geo_status='machine_high')`),
   editoriallyVerifiedGeo:n(`SELECT count(DISTINCT e.id) n FROM calendar_geo_entities e JOIN calendar_geo_relations r ON r.entity_id=e.id JOIN calendar_geo_places p ON p.id=r.place_id WHERE ${canonical} AND ${credible} AND p.geo_status='reviewed_verified' AND r.geo_status='reviewed_verified'`),
   storedEntitiesWithoutGeo:entities-geo,
   geographicDays:n(`SELECT count(DISTINCT o.civil_date) n FROM calendar_geo_occurrences o JOIN calendar_geo_rules rule ON rule.id=o.rule_id JOIN calendar_geo_entities e ON e.id=rule.entity_id JOIN calendar_geo_relations r ON r.entity_id=e.id JOIN calendar_geo_places p ON p.id=r.place_id WHERE o.civil_date LIKE '2026-%' AND ${credible}`),
   translations,images:all('SELECT status,count(*) n FROM calendar_geo_images GROUP BY status'),metrics:all('SELECT * FROM calendar_geo_metrics'),
   integrity:all('PRAGMA integrity_check'),foreignKeyErrors:all('PRAGMA foreign_key_check'),
 },null,2));
}finally{db.close();}
