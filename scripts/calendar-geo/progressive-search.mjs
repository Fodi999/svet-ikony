// Candidate discovery continues past unrelated hits; only a unique HIGH match ends it early.
export async function progressiveSearch(variants,search,assess){
  const ids=new Set(),searches=[];
  let match=await assess([]);
  for(const variant of variants){
    const hits=await search(variant);
    const added=hits.filter(id=>!ids.has(id));
    for(const id of added)ids.add(id);
    searches.push({...variant,hits:hits.length});
    if(added.length)match=await assess([...new Set(added)]);
    if(match.status==='machine_high')break;
  }
  return {match,searches};
}
