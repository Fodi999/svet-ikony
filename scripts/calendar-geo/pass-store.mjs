export function localCache(db){return {
  get:key=>{const row=db.prepare('SELECT payload_json FROM calendar_geo_http_cache WHERE cache_key=?').get(key);return row?JSON.parse(row.payload_json):null;},
  set:(key,value)=>db.prepare('INSERT INTO calendar_geo_http_cache(cache_key,url,retrieved_at,payload_json) VALUES (?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET retrieved_at=excluded.retrieved_at,payload_json=excluded.payload_json').run(key,value.url,value.retrievedAt,JSON.stringify(value)),
};}
export function yearProfiles(db,year){return db.prepare(`SELECT DISTINCT p.* FROM calendar_geo_profiles p
  LEFT JOIN calendar_geo_rule_profiles rp ON rp.profile_id=p.id LEFT JOIN calendar_geo_occurrences o ON o.rule_id=rp.rule_id
  WHERE (o.civil_date BETWEEN ? AND ?) OR p.id LIKE 'internal:saint:%' ORDER BY p.id`).all(`${year}-01-01`,`${year}-12-31`);}
