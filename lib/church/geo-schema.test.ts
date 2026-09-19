import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('calendar geo schema',()=>{
  it('enforces unique identities, relationships, coordinates and translations',()=>{
    const sql=readFileSync('migrations/0026_calendar_geo.sql','utf8');
    const result=execFileSync(process.execPath,['--input-type=module','-e',`
      import {DatabaseSync} from 'node:sqlite';
      import assert from 'node:assert/strict';
      const db=new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys=ON; CREATE TABLE church_calendar_days(id TEXT PRIMARY KEY);');
      db.exec(${JSON.stringify(sql)});
      db.exec("INSERT INTO calendar_geo_sources(id,source_type,source_url,retrieved_at) VALUES ('s','manual','https://example.org','2026-09-19')");
      db.exec("INSERT INTO calendar_geo_entities(id,entity_type,canonical_name,wikidata_id) VALUES ('e','saint','Test','Q1')");
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_entities(id,entity_type,canonical_name,wikidata_id) VALUES ('e2','saint','Test','Q1')"));
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_places(id,canonical_name,place_type,lat,lon) VALUES ('bad','Bad','city',91,0)"));
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_places(id,canonical_name,place_type,lat) VALUES ('bad','Bad','city',40)"));
      db.exec("INSERT INTO calendar_geo_places(id,canonical_name,place_type) VALUES ('p','Unknown','other')");
      db.exec("INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id) VALUES ('e','p','birth','s')");
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id) VALUES ('e','p','birth','s')"));
      db.exec("INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id) VALUES ('e','p','burial','s')");
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_relations(entity_id,place_id,relation_type,source_id) VALUES ('missing','p','birth','s')"));
      db.exec("INSERT INTO calendar_geo_translations(id,entity_id,locale,name,translation_status,source_locale,source_id) VALUES ('t','e','uk','Test','fallback','en','s')");
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_translations(id,entity_id,locale,name,translation_status,source_locale,source_id) VALUES ('t2','e','uk','Test','fallback','en','s')"));
      assert.throws(()=>db.exec("INSERT INTO calendar_geo_rules(id,source_title,source_id,rule_type,calendar_system) VALUES ('bad','Missing date','s','fixed','julian')"));
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
      db.close(); console.log('PASS');
    `],{encoding:'utf8'});
    expect(result.trim()).toBe('PASS');
  });
});
