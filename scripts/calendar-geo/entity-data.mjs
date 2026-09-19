export const entityParams={action:'wbgetentities',props:'labels|descriptions|aliases|claims|sitelinks',languages:'uk|ru|en'};
export const placeProperties=['P19','P20','P119','P551'];
export function values(entity,property){return (entity.claims?.[property]??[]).filter(c=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value').map(c=>c.mainsnak.datavalue?.value).filter(v=>v!==undefined);}
function yearOf(entity,property){const v=values(entity,property);if(v.length!==1||v[0].precision<9)return undefined;return Number(v[0].time?.match(/^([+-]\d+)-/)?.[1])||undefined;}
export function candidate(entity){return {qid:entity.id,names:[...Object.values(entity.labels??{}).map(v=>v.value),...Object.values(entity.aliases??{}).flatMap(v=>v.map(a=>a.value))],
  description:entity.descriptions?.en?.value??'',roleIds:[...values(entity,'P106'),...values(entity,'P39')].map(v=>v.id),
  placeIds:placeProperties.flatMap(p=>values(entity,p).map(v=>v.id)),birthYear:yearOf(entity,'P569'),deathYear:yearOf(entity,'P570'),
  isHuman:values(entity,'P31').some(v=>v.id==='Q5'),referenceUrls:Object.values(entity.claims??{}).flatMap(cs=>cs.flatMap(c=>(c.references??[]).flatMap(r=>(r.snaks?.P854??[]).map(s=>s.datavalue?.value).filter(v=>typeof v==='string'))))};}
export async function fetchEntities(client,ids){
  const unique=[...new Set(ids)].filter(id=>/^Q\d+$/.test(id)),entities={};
  for(let start=0;start<unique.length;start+=50){
    const result=await client.get('www.wikidata.org',{...entityParams,ids:unique.slice(start,start+50).join('|')});
    if(!result.body?.entities)throw new Error('Malformed entity response');
    Object.assign(entities,result.body.entities);
  }
  return entities;
}
