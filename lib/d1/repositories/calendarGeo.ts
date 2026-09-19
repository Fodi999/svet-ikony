import {d1All,d1First} from '@/lib/d1/db';
import {ApiError} from '@/lib/d1/errors';
import {entryCategory} from '@/lib/church/calendar-entry';
import {resolveMediaUrl} from '@/lib/media/resolver';
// Published, explicitly linked internal content takes precedence over external translations.
const internalName=`(SELECT s.name FROM church_saints s JOIN calendar_geo_content_links l ON l.translation_group_id=s.translation_group_id AND l.content_type='saint' WHERE l.entity_id=e.id AND s.status='published' AND s.language=? ORDER BY s.id LIMIT 1)`;
export type CalendarGeoItem={entityId:string;entityType:string;title:string;placeId:string;placeTitle:string;relationType:string;lat:number;lon:number;markerPriority:number;thumbnail:string|null;matchStatus:string;geoStatus?:string};
const mapSelect=`SELECT DISTINCT e.id AS entityId,e.entity_type AS entityType,
 COALESCE(t.name,te.name,e.canonical_name) AS title,
 p.id AS placeId,COALESCE(pt.name,pte.name,p.canonical_name) AS placeTitle,
 rel.relation_type AS relationType,p.lat,p.lon,CASE e.entity_type WHEN 'feast' THEN 90 WHEN 'church' THEN 80 WHEN 'monastery' THEN 80 WHEN 'shrine' THEN 80 ELSE 70 END AS markerPriority,
 (SELECT image_url FROM calendar_geo_images im WHERE im.entity_id=e.id AND im.status='usable' LIMIT 1) AS thumbnail,
 e.match_status AS matchStatus,CASE WHEN rel.geo_status='reviewed_verified' AND p.geo_status='reviewed_verified' THEN 'reviewed_verified' ELSE 'machine_high' END AS geoStatus
 FROM calendar_geo_entities e
 JOIN calendar_geo_relations rel ON rel.entity_id=e.id
 JOIN calendar_geo_places p ON p.id=rel.place_id
 LEFT JOIN calendar_geo_translations t ON t.entity_id=e.id AND t.locale=?
 LEFT JOIN calendar_geo_translations te ON te.entity_id=e.id AND te.locale='en'
 LEFT JOIN calendar_geo_translations pt ON pt.place_id=p.id AND pt.locale=?
 LEFT JOIN calendar_geo_translations pte ON pte.place_id=p.id AND pte.locale='en'`;
const credible=`e.match_status IN ('machine_high','reviewed_verified')
 AND rel.match_status IN ('machine_high','reviewed_verified')
 AND p.match_status IN ('machine_high','reviewed_verified')
 AND rel.geo_status IN ('machine_high','reviewed_verified')
 AND p.geo_status IN ('machine_high','reviewed_verified')
 AND p.lat BETWEEN -90 AND 90 AND p.lon BETWEEN -180 AND 180`;
export async function calendarGeoDay(query:{date:string;locale:string;calendarSystem:string;tradition:string}) {
  const {date,locale,calendarSystem,tradition}=query;
  const day=await d1First('SELECT civil_date FROM calendar_geo_days WHERE civil_date=? AND calendar_system=? AND tradition=? AND jurisdiction=\'\'',date,calendarSystem,tradition);
  if(!day)throw ApiError.notFound('Date has not been resolved for this calendar policy');
  const items=await d1All<CalendarGeoItem>(`${mapSelect} WHERE ${credible} AND EXISTS (
    SELECT 1 FROM calendar_geo_rules r JOIN calendar_geo_occurrences o ON o.rule_id=r.id
    WHERE r.entity_id=e.id AND o.civil_date=? AND o.calendar_system=? AND o.tradition=? AND o.jurisdiction='')
    ORDER BY markerPriority DESC,entityId,placeId,relationType`,locale,locale,date,calendarSystem,tradition);
  const counts=await d1First<{commemorations:number}>('SELECT count(*) AS commemorations FROM calendar_geo_occurrences WHERE civil_date=? AND calendar_system=? AND tradition=? AND jurisdiction=\'\'',date,calendarSystem,tradition);
  const rows=await d1All<{id:string;entityId:string|null;title:string;summary:string;entityType:string|null;sourceTitle:string}>(`SELECT r.id,r.entity_id AS entityId,
    COALESCE(${internalName},NULLIF(t.name,''),NULLIF(te.name,''),e.canonical_name,r.source_title) AS title,
    COALESCE(NULLIF(t.short_description,''),te.short_description,'') AS summary,
    e.entity_type AS entityType,r.source_title AS sourceTitle
    FROM calendar_geo_occurrences o JOIN calendar_geo_rules r ON r.id=o.rule_id
    LEFT JOIN calendar_geo_entities e ON e.id=r.entity_id
    LEFT JOIN calendar_geo_translations t ON t.entity_id=e.id AND t.locale=?
    LEFT JOIN calendar_geo_translations te ON te.entity_id=e.id AND te.locale='en'
    WHERE o.civil_date=? AND o.calendar_system=? AND o.tradition=? AND o.jurisdiction='' ORDER BY r.id`,locale,locale,date,calendarSystem,tradition);
  const geographic=new Set(items.map(item=>item.entityId));
  const entries=rows.map(({sourceTitle,...entry})=>({...entry,entityType:entryCategory(entry.entityType,sourceTitle),hasGeo:entry.entityId!==null&&geographic.has(entry.entityId)}));
  return {...query,commemorations:counts?.commemorations??0,entries,items};
}
/** Local, read-only catalog. Coordinates retain the same provenance gates as the day API. */
export async function calendarGeoCatalog(locale:string) {
  const items=await d1All<CalendarGeoItem>(`${mapSelect} WHERE ${credible} ORDER BY entityId,placeId,relationType`,locale,locale);
  const rows=await d1All<{id:string;title:string;entityType:string}>(`SELECT e.id,COALESCE(${internalName},t.name,te.name,e.canonical_name) AS title,e.entity_type AS entityType FROM calendar_geo_entities e LEFT JOIN calendar_geo_translations t ON t.entity_id=e.id AND t.locale=? LEFT JOIN calendar_geo_translations te ON te.entity_id=e.id AND te.locale='en' ORDER BY title`,locale,locale);
  const geographic=new Set(items.map(item=>item.entityId));
  return {items,entries:rows.map(row=>({...row,entityId:row.id,summary:'',hasGeo:geographic.has(row.id)}))};
}
export async function calendarEntry(id:string,locale:string) {
  const rule=await d1First<{id:string;entityId:string|null;title:string;url:string;type:string}>(`SELECT r.id,r.entity_id AS entityId,r.source_title AS title,s.source_url AS url,s.source_type AS type FROM calendar_geo_rules r JOIN calendar_geo_sources s ON s.id=r.source_id WHERE r.id=?`,id);
  if(!rule)throw ApiError.notFound('Unknown calendar entry');
  if(rule.entityId)return calendarGeoEntity(rule.entityId,locale);
  return {id:rule.id,title:rule.title,summary:'',entityType:entryCategory(null,rule.title),matchStatus:'unmatched',wikipedia:null,places:[],image:null,relatedContent:[],sources:[{url:rule.url,type:rule.type}]};
}
export async function calendarGeoEntity(id:string,locale:string) {
  for(let depth=0;depth<32;depth++){
    const redirect=await d1First<{canonical_id:string}>('SELECT canonical_id FROM calendar_geo_entity_redirects WHERE old_id=?',id);
    if(!redirect)break;id=redirect.canonical_id;
  }
  const entity=await d1First<{id:string;entityType:string;title:string;summary:string;wikipedia:string|null;matchStatus:string}>(`SELECT e.id,e.entity_type AS entityType,
    COALESCE(${internalName},t.name,te.name,e.canonical_name) AS title,COALESCE(NULLIF(t.short_description,''),te.short_description,'') AS summary,
    COALESCE(t.wikipedia_url,te.wikipedia_url) AS wikipedia,e.match_status AS matchStatus FROM calendar_geo_entities e
    LEFT JOIN calendar_geo_translations t ON t.entity_id=e.id AND t.locale=?
    LEFT JOIN calendar_geo_translations te ON te.entity_id=e.id AND te.locale='en' WHERE e.id=?`,locale,locale,id);
  if(!entity)throw ApiError.notFound('Unknown calendar entity');
  const places=await d1All<CalendarGeoItem>(`${mapSelect} WHERE ${credible} AND e.id=? ORDER BY placeId,relationType`,locale,locale,id);
  const commemorations=await d1All('SELECT DISTINCT o.civil_date AS date,o.calendar_system AS calendarSystem,o.tradition FROM calendar_geo_occurrences o JOIN calendar_geo_rules r ON r.id=o.rule_id WHERE r.entity_id=? ORDER BY o.civil_date',id);
  const sources=await d1All(`SELECT DISTINCT s.source_type AS type,s.source_url AS url,s.license,s.attribution,s.retrieved_at AS retrievedAt FROM calendar_geo_sources s WHERE s.id IN (
    SELECT source_id FROM calendar_geo_provenance WHERE entity_id=? UNION SELECT source_id FROM calendar_geo_translations WHERE entity_id=? UNION SELECT source_id FROM calendar_geo_images WHERE entity_id=?)`,id,id,id);
  const image=await d1First('SELECT image_url AS url,author,license,license_url AS licenseUrl,commons_page AS commonsPage,attribution FROM calendar_geo_images WHERE entity_id=? AND status=\'usable\' LIMIT 1',id);
  const links=await d1All<{type:string;slug:string;title:string;language:string;groupId:string}>(`SELECT * FROM (
    SELECT 'life' AS type,s.slug,s.name AS title,s.language,s.translation_group_id AS groupId FROM church_saints s JOIN calendar_geo_content_links l ON l.translation_group_id=s.translation_group_id AND l.content_type='saint' WHERE l.entity_id=? AND s.status='published'
    UNION ALL SELECT 'article',a.slug,a.title,a.language,a.translation_group_id FROM church_articles a JOIN calendar_geo_content_links l ON l.translation_group_id=a.translation_group_id AND l.content_type='article' WHERE l.entity_id=? AND a.status='published'
    UNION ALL SELECT 'prayer',p.slug,p.title,p.language,p.translation_group_id FROM church_prayers p JOIN calendar_geo_content_links l ON l.translation_group_id=p.translation_group_id AND l.content_type='prayer' WHERE l.entity_id=? AND p.status='published'
    UNION ALL SELECT 'icon',i.slug,i.title,i.language,i.translation_group_id FROM church_icons i JOIN calendar_geo_content_links l ON l.translation_group_id=i.translation_group_id AND l.content_type='icon' WHERE l.entity_id=? AND i.status='published'
    ) ORDER BY CASE WHEN language=? THEN 0 WHEN language='en' THEN 1 ELSE 2 END,type,slug`,id,id,id,id,locale);
  const chosen=new Map<string,typeof links[number]>();
  for(const link of links){const key=`${link.type}:${link.groupId}`;if(!chosen.has(key))chosen.set(key,link);}
  const relatedContent=[...chosen.values()];
  const internal=await d1First<{summary:string;biography:string;imageUrl:string;language:string}>(`SELECT s.short_description AS summary,s.biography,s.image_url AS imageUrl,s.language FROM church_saints s JOIN calendar_geo_content_links l ON l.translation_group_id=s.translation_group_id AND l.content_type='saint' WHERE l.entity_id=? AND s.status='published' ORDER BY CASE WHEN s.language=? THEN 0 WHEN s.language='en' THEN 1 ELSE 2 END,s.id LIMIT 1`,id,locale);
  const internalImage=resolveMediaUrl(internal?.imageUrl??'');
  return {...entity,summary:(internal?.language===locale?internal.summary:'')||entity.summary||internal?.summary||'',biography:internal?.biography||'',places,commemorations,sources,
    image:internalImage?{url:internalImage,author:'',license:'',commonsPage:''}:image,relatedContent};
}
