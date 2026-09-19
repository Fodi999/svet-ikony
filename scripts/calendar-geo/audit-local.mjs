import {openLocalStore} from './local-store.mjs';
import {isGroupName} from './search-strategy.mjs';
const db=await openLocalStore();
try {
 const all=sql=>db.prepare(sql).all();
 const profiles=all("SELECT id,profile_json FROM calendar_geo_profiles WHERE match_status='not_found' ORDER BY id LIMIT 20");
 const searches=all("SELECT url,payload_json FROM calendar_geo_http_cache WHERE url LIKE '%action=wbsearchentities%'").map(r=>({url:new URL(r.url),payload:JSON.parse(r.payload_json)}));
 const reasons={};
 const samples=profiles.map(row=>{
   const p=JSON.parse(row.profile_json),name=p.names[0];
   const observed=searches.filter(s=>p.names.includes(s.url.searchParams.get('search'))).map(s=>({query:s.url.searchParams.get('search'),language:s.url.searchParams.get('language'),hits:s.payload.body?.search?.length}));
   const category=isGroupName(name)?'group_commemoration':/Свято|Передсвято|Circumcision|Чудо /i.test(name)?'feast_or_event_in_saint_search':/Icon of/i.test(name)?'icon_title':/[іїєґ]/i.test(name)?'ukrainian_ecclesiastical_form':'long_title_or_epithet';
   reasons[category]=(reasons[category]??0)+1;
   return {id:row.id,name,category,observedSearches:observed,diagnosis:'No search candidates in cached query; this does not establish Wikidata absence. Confidence threshold was not the cause of zero search hits.'};
 });
 console.log(JSON.stringify({
   profileKinds:all("SELECT CASE WHEN id LIKE 'source:%' THEN 'calendar_rule' WHEN id LIKE 'internal:saint:%' THEN 'internal_translation_group' ELSE 'unexpected' END kind,count(*) count FROM calendar_geo_profiles GROUP BY 1"),
   legacyLanguages:all('SELECT language,count(*) count FROM church_saints GROUP BY language'),
   duplicateRuleLinks:all('SELECT rule_id,count(*) count FROM calendar_geo_rule_profiles GROUP BY rule_id HAVING count(*)>1'),
   duplicateQids:all('SELECT wikidata_id,count(*) count FROM calendar_geo_entities WHERE wikidata_id IS NOT NULL GROUP BY wikidata_id HAVING count(*)>1'),
   statuses:all('SELECT match_status,enrichment_status,count(*) count FROM calendar_geo_profiles GROUP BY 1,2'),
   metrics:all('SELECT * FROM calendar_geo_metrics'),
   noMatchSample:{count:samples.length,observableRiskCategories:reasons,samples},
 },null,2));
}finally{db.close();}
