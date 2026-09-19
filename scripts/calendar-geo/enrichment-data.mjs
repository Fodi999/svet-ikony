import {transaction} from './local-store.mjs';
const locales=['uk','ru','en'];
const vals=(e,p)=>(e.claims?.[p]??[]).filter(c=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value').map(c=>c.mainsnak.datavalue?.value).filter(v=>v!==undefined);
export async function enrichMatched(db,client,profileRow,entity,{pass='all'}={}) {
  if(!['all','identity','geo','wikipedia','commons'].includes(pass))throw new Error('Unknown enrichment pass');
  const details=[],places=[],administrativeEntities=new Map();let image=null;
  const stage=(name,status,detail={})=>db.prepare('INSERT INTO calendar_geo_stages(profile_id,stage,status,detail_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(profile_id,stage) DO UPDATE SET status=excluded.status,detail_json=excluded.detail_json,updated_at=excluded.updated_at').run(profileRow.id,name,status,JSON.stringify(detail),new Date().toISOString());
  persist();stage('entity','complete',{qid:entity.id});
  if(pass==='all'||pass==='wikipedia'){
  stage('wikipedia','running');
  for(const locale of locales) {
    const title=entity.sitelinks?.[`${locale}wiki`]?.title;
    if(!title)continue;
    const result=await client.get(`${locale}.wikipedia.org`,{action:'query',titles:title,prop:'extracts|info',exintro:1,explaintext:1,exchars:500,inprop:'url',formatversion:2,redirects:1});
    const page=result.body.query?.pages?.[0];
    if(page&&!page.missing){details.push({locale,page,result});persist();}
  }
  stage('wikipedia','complete');}
  if(pass==='all'||pass==='geo'){
  stage('places','running');
  const placeResults=new Map();
  const placeIds=[...new Set(['P19','P20','P119','P551'].flatMap(p=>vals(entity,p).map(v=>v.id)).filter(id=>/^Q\d+$/.test(id)))];
  for(let start=0;start<placeIds.length;start+=50){
    const ids=placeIds.slice(start,start+50);
    const result=await client.get('www.wikidata.org',{action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en'});
    for(const id of ids)placeResults.set(id,result);
  }
  for(const [property,relation] of [['P19','birth'],['P20','death'],['P119','burial'],['P551','residence']]) {
    for(const value of vals(entity,property)) {
      if(!/^Q\d+$/.test(value.id))continue;
      const result=placeResults.get(value.id);
      const place=result.body.entities?.[value.id];if(!place||'missing'in place)continue;
      const coords=vals(place,'P625').filter(c=>c.globe==='http://www.wikidata.org/entity/Q2'&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180);
      // Conflicting coordinates are review data, not an arbitrary first point.
      const distinct=[...new Map(coords.map(c=>[`${c.latitude}:${c.longitude}`,c])).values()];
      places.push({place,relation,property,result,coordinate:distinct.length===1?distinct[0]:null});
      persist();
    }
  }
  const administrativeIds=[...new Set(places.flatMap(({place})=>['P17','P131'].flatMap(property=>vals(place,property).map(value=>value.id))).filter(id=>/^Q\d+$/.test(id)))];
  for(let start=0;start<administrativeIds.length;start+=50){
    const result=await client.get('www.wikidata.org',{action:'wbgetentities',ids:administrativeIds.slice(start,start+50).join('|'),props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en'});
    for(const [id,value] of Object.entries(result.body.entities??{}))if(!('missing'in value))administrativeEntities.set(id,value);
  }
  persist();
  stage('places','complete');stage('coordinates','complete',{known:places.filter(p=>p.coordinate).length,unknown:places.filter(p=>!p.coordinate).length});}
  if(pass==='all'||pass==='commons'){
  stage('commons','running');
  const filename=vals(entity,'P18')[0];
  if(typeof filename==='string') {
    const result=await client.get('commons.wikimedia.org',{action:'query',titles:`File:${filename}`,prop:'imageinfo',iiprop:'url|extmetadata',formatversion:2});
    const info=result.body.query?.pages?.[0]?.imageinfo?.[0];
    if(info)image={filename,info,result};
  }
  persist();stage('commons','complete');}
  stage('persistence','complete',{pass});
  function persist(){transaction(db,()=>{
    const fresh=db.prepare('SELECT * FROM calendar_geo_profiles WHERE id=?').get(profileRow.id);
    if(fresh.match_status==='reviewed_rejected'||fresh.updated_at!==profileRow.updated_at)throw new Error('Profile changed during enrichment; resume from fresh review');
    const existing=db.prepare('SELECT * FROM calendar_geo_entities WHERE wikidata_id=?').get(entity.id);
    if(existing&&profileRow.entity_id&&existing.id!==profileRow.entity_id)throw new Error('Canonical identity merge requires review');
    const id=existing?.id??profileRow.entity_id??`wd:${entity.id}`;
    const current=db.prepare('SELECT * FROM calendar_geo_entities WHERE id=?').get(id);
    if(current?.match_status==='reviewed_rejected')throw new Error('Reviewed identity is immutable to importer');
    const type=vals(entity,'P31').some(v=>v.id==='Q5')?'saint':'church_event';
    db.prepare("INSERT INTO calendar_geo_entities(id,entity_type,canonical_name,wikidata_id,match_status,identity_profile) VALUES (?,?,?,?,'machine_high',?) ON CONFLICT(id) DO UPDATE SET wikidata_id=excluded.wikidata_id,match_status='machine_high' WHERE match_status NOT IN ('reviewed_verified','reviewed_rejected')")
      .run(id,type,entity.labels?.en?.value??entity.id,entity.id,profileRow.profile_json);
    const sourceId=`wikidata:${entity.id}`;
    db.prepare("INSERT INTO calendar_geo_sources(id,source_type,source_url,external_id,retrieved_at,license) VALUES (?,'wikidata',?,?,?,'CC0') ON CONFLICT(id) DO NOTHING")
      .run(sourceId,`https://www.wikidata.org/wiki/${entity.id}`,entity.id,new Date().toISOString());
    for(const property of ['P569','P570','P19','P20','P119','P551','P27','P106','P39','P18','P31']) {
      const value=entity.claims?.[property];if(!value)continue;
      db.prepare('INSERT INTO calendar_geo_provenance(id,entity_id,field_name,source_id,value_json) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
        .run(`${id}:${property}`,id,property,sourceId,JSON.stringify(value));
    }
    for(const locale of locales) {
      const wiki=details.find(d=>d.locale===locale);
      // Preserve a previously persisted Wikipedia enrichment while another stage retries.
      if(!wiki&&db.prepare('SELECT 1 FROM calendar_geo_translations WHERE entity_id=? AND locale=? AND wikipedia_url IS NOT NULL').get(id,locale))continue;
      let translationSource=sourceId;
      if(wiki){translationSource=`wikipedia:${locale}:${wiki.page.pageid}`;
        db.prepare("INSERT INTO calendar_geo_sources(id,source_type,source_url,external_id,retrieved_at,license,attribution) VALUES (?,'wikipedia',?,?,?,'CC BY-SA 4.0',?) ON CONFLICT(id) DO NOTHING")
          .run(translationSource,wiki.page.fullurl,String(wiki.page.pageid),wiki.result.retrievedAt,`Wikipedia contributors: ${wiki.page.title}`);}
      const label=wiki?.page.title??entity.labels?.[locale]?.value??entity.labels?.en?.value??entity.id;
      const native=Boolean(wiki||entity.labels?.[locale]?.value);
      const summary=wiki?.page.extract??entity.descriptions?.[locale]?.value??'';
      db.prepare('INSERT INTO calendar_geo_translations(id,entity_id,locale,name,short_description,wikipedia_url,translation_status,source_locale,source_id) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(entity_id,locale) DO UPDATE SET name=excluded.name,short_description=excluded.short_description,wikipedia_url=excluded.wikipedia_url,translation_status=excluded.translation_status,source_locale=excluded.source_locale,source_id=excluded.source_id WHERE translation_status != \'verified\'')
        .run(`${id}:${locale}`,id,locale,label,summary,wiki?.page.fullurl??null,native?'source':'fallback',native?locale:'en',translationSource);
    }
    for(const {place,relation,property,result,coordinate} of places) {
      const pid=`wd:${place.id}`,sid=`wikidata:${place.id}`;
      db.prepare("INSERT INTO calendar_geo_sources(id,source_type,source_url,external_id,retrieved_at,license) VALUES (?,'wikidata',?,?,?,'CC0') ON CONFLICT(id) DO NOTHING").run(sid,`https://www.wikidata.org/wiki/${place.id}`,place.id,result.retrievedAt);
      db.prepare("INSERT INTO calendar_geo_places(id,canonical_name,lat,lon,place_type,wikidata_id,match_status) VALUES (?,?,?,?,'other',?,'machine_high') ON CONFLICT(wikidata_id) DO NOTHING")
        .run(pid,place.labels?.en?.value??place.id,coordinate?.latitude??null,coordinate?.longitude??null,place.id);
      const actual=db.prepare('SELECT id FROM calendar_geo_places WHERE wikidata_id=?').get(place.id).id;
      const countryCodes=[...new Set(vals(place,'P17').flatMap(value=>vals(administrativeEntities.get(value.id)??{},'P297')).filter(value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value)))];
      const regions=[...new Set(vals(place,'P131').map(value=>administrativeEntities.get(value.id)?.labels?.en?.value).filter(Boolean))];
      // Ambiguous historical/current countries stay unknown; original claims remain in provenance.
      if(countryCodes.length===1||regions.length)db.prepare("UPDATE calendar_geo_places SET country_code=COALESCE(?,country_code),region=COALESCE(?,region) WHERE id=? AND geo_status NOT IN ('reviewed_verified','reviewed_rejected','manual_unverified')").run(countryCodes.length===1?countryCodes[0]:null,regions.length?regions.join('; '):null,actual);
      db.prepare("UPDATE calendar_geo_places SET geo_status=? WHERE id=? AND geo_status NOT IN ('reviewed_verified','reviewed_rejected','manual_unverified')").run(coordinate?'machine_high':'unknown',actual);
      for(const locale of locales){const native=Boolean(place.labels?.[locale]?.value);
        db.prepare('INSERT INTO calendar_geo_translations(id,place_id,locale,name,translation_status,source_locale,source_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(place_id,locale) DO NOTHING')
          .run(`${actual}:${locale}`,actual,locale,place.labels?.[locale]?.value??place.labels?.en?.value??place.id,native?'source':'fallback',native?locale:'en',sid);}
      for(const field of ['P625','P17','P131'])if(place.claims?.[field])db.prepare('INSERT INTO calendar_geo_provenance(id,place_id,field_name,source_id,value_json) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(`${actual}:${field}`,actual,field,sid,JSON.stringify(place.claims[field]));
      db.prepare("INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id,match_status) VALUES (?,?,?,?,'machine_high') ON CONFLICT DO NOTHING").run(id,actual,relation,sourceId);
      db.prepare("UPDATE calendar_geo_relations SET geo_status='machine_high' WHERE entity_id=? AND place_id=? AND relation_type=? AND geo_status='unknown' AND match_status!='reviewed_rejected'").run(id,actual,relation);
      db.prepare('INSERT INTO calendar_geo_provenance(id,entity_id,field_name,source_id,value_json) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(`${id}:${property}:${actual}`,id,`${property}:${actual}`,sourceId,JSON.stringify({placeId:place.id,relation}));
    }
    if(image){const metadata=image.info.extmetadata??{};
      const license=metadata.LicenseShortName?.value??'',author=metadata.Artist?.value??'',licenseUrl=metadata.LicenseUrl?.value??'';
      const usable=Boolean(author&&licenseUrl&&/^(CC0|CC BY(?:-SA)? [1-4]\.0|Public domain)$/.test(license));
      const sid=`commons:${image.filename}`;
      db.prepare("INSERT INTO calendar_geo_sources(id,source_type,source_url,external_id,retrieved_at,license,attribution) VALUES (?,'wikimedia_commons',?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(sid,image.info.descriptionurl,image.filename,image.result.retrievedAt,license,author);
      db.prepare('INSERT INTO calendar_geo_images(id,entity_id,commons_page,image_url,author,license,license_url,attribution,source_id,status) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
        .run(`${id}:image`,id,image.info.descriptionurl,usable?image.info.url:null,author,license,licenseUrl,`${author} / ${license}`,sid,usable?'usable':'needs_review');}
    db.prepare('UPDATE calendar_geo_profiles SET entity_id=? WHERE id=?').run(id,profileRow.id);
    db.prepare('UPDATE calendar_geo_rules SET entity_id=? WHERE id IN (SELECT rule_id FROM calendar_geo_rule_profiles WHERE profile_id=?) AND entity_id IS NULL').run(id,profileRow.id);
    if(places.some(p=>p.coordinate))db.prepare("UPDATE calendar_geo_entities SET geo_status='machine_high' WHERE id=? AND geo_status IN ('unknown','needs_review') AND NOT EXISTS(SELECT 1 FROM calendar_geo_review_log l JOIN calendar_geo_profiles p ON p.id=l.target_id WHERE p.entity_id=? AND l.action='geo_unknown')").run(id,id);
  });}
}
