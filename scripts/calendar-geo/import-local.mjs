import {readFileSync, readdirSync, realpathSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {DatabaseSync, backup} from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
registerHooks({resolve(specifier, context, next) {
  return next(specifier.startsWith('@/') ? pathToFileURL(join(root, `${specifier.slice(2)}.ts`)).href : specifier, context);
}});
const {civilDays, resolveCalendarDay} = await import('../../lib/church/geo-resolver.ts');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply' && !/^--year=\d{4}$/.test(arg))) throw new Error('Only --apply and --year=YYYY are accepted. No remote mode.');
const year = Number(args.find(arg => arg.startsWith('--year='))?.slice(7) ?? new Date().getUTCFullYear());
const dates = civilDays(year);
const sourceBytes = readFileSync(join(root, 'lib/church/data/orthodox-fixed-calendar.json'));
const snapshot = JSON.parse(sourceBytes);
if (snapshot.calendar !== 'fixed-julian-month-day' || Object.keys(snapshot.days).length !== 366) throw new Error('Unexpected source snapshot');
const hash = createHash('sha256').update(sourceBytes).update('calendar-geo-v1').digest('hex');
const policy = {calendarSystem:'julian', tradition:'orthodox', jurisdiction:''};
const rules = [];
for (const [monthDay, day] of Object.entries(snapshot.days)) {
  const [month, date] = monthDay.split('-').map(Number);
  for (const entry of day.entries) rules.push({...policy,id:`oca-fixed:${monthDay}:${entry.id}`,type:'fixed',month,day:date,
    title:entry.title,sourceId:`oca-fixed:${monthDay}`,sourceUrl:day.sourceUrls[0]});
}
const movable = [
  {id:'pascha',offset:0,names:{en:'Pascha',uk:'Пасха',ru:'Пасха'}},
  {id:'palm-sunday',offset:-7,names:{en:'Palm Sunday',uk:'Вхід Господній у Єрусалим',ru:'Вход Господень в Иерусалим'}},
  {id:'ascension',offset:39,names:{en:'Ascension',uk:'Вознесіння Господнє',ru:'Вознесение Господне'}},
  {id:'pentecost',offset:49,names:{en:'Pentecost',uk:'П’ятидесятниця',ru:'Пятидесятница'}},
];
for (const entry of movable) rules.push({...policy,id:`paschal:${entry.id}`,type:'movable',anchor:'orthodox_pascha',offsetDays:entry.offset,title:entry.names.en,sourceId:'oca-paschal-cycle'});
const resolved = dates.map(date => ({date,ids:resolveCalendarDay(date,rules,policy)}));
console.log(JSON.stringify({mode:args.includes('--apply')?'LOCAL WRITE':'DRY RUN',year,days:dates.length,rules:rules.length,occurrences:resolved.reduce((n,d)=>n+d.ids.length,0),sourceHash:hash}));
if (!args.includes('--apply')) process.exit(0);

// Never use wrangler's production bindings or accept an arbitrary database path.
const state = realpathSync(join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject'));
if (!state.startsWith(`${realpathSync(root)}/.wrangler/`)) throw new Error('Local database path escaped project');
const candidates = readdirSync(state).filter(name=>/^[a-f0-9]{64}\.sqlite$/.test(name)).filter(name=> {
  const path = realpathSync(join(state,name));
  if (dirname(path) !== state) throw new Error('Database symlink rejected');
  const db = new DatabaseSync(path,{readOnly:true});
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='church_calendar_days'").get()); }
  finally { db.close(); }
});
if (candidates.length !== 1) throw new Error(`Expected one existing local church database, found ${candidates.length}`);
const db = new DatabaseSync(join(state,candidates[0]));
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const backupDir = join(root,'.wrangler/calendar-geo-backups');
  mkdirSync(backupDir,{recursive:true});
  const backupPath = join(backupDir,`before-calendar-geo-${hash}.sqlite`);
  if (!existsSync(backupPath)) await backup(db,backupPath);
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_rules'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(join(root,'migrations/0026_calendar_geo.sql'),'utf8'));
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='d1_migrations'").get()) db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0026_calendar_geo.sql');
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  const now = new Date().toISOString();
  const jobId = `fixed-year:${year}:julian:orthodox`;
  const oldJob = db.prepare('SELECT * FROM calendar_geo_import_jobs WHERE id=?').get(jobId);
  if (oldJob && oldJob.source_hash !== hash) throw new Error('Source changed; explicit reconciliation is required');
  db.prepare("INSERT INTO calendar_geo_import_jobs(id,source_hash,status,updated_at) VALUES (?,?,'running',?) ON CONFLICT(id) DO UPDATE SET status='running',updated_at=excluded.updated_at,error=NULL").run(jobId,hash,now);
  db.exec('BEGIN IMMEDIATE');
  try {
    const source = db.prepare("INSERT INTO calendar_geo_sources(id,source_type,source_url,external_id,retrieved_at) VALUES (?,'church_source',?,?,?) ON CONFLICT(id) DO NOTHING");
    for (const [monthDay,day] of Object.entries(snapshot.days)) source.run(`oca-fixed:${monthDay}`,day.sourceUrls[0],monthDay,snapshot.retrievedAt);
    source.run('oca-paschal-cycle','https://www.oca.org/fs/paschal-cycle','paschal-cycle','2026-09-19');
    const insert = db.prepare("INSERT INTO calendar_geo_rules(id,entity_id,source_title,source_id,rule_type,month,day,anchor,offset_days,calendar_system,tradition,verification_status) VALUES (?,?,?,?,?,?,?,?,?,'julian','orthodox',?) ON CONFLICT(id) DO NOTHING");
    for (const entry of movable) {
      const id = `feast:${entry.id}`;
      db.prepare("INSERT INTO calendar_geo_entities(id,entity_type,canonical_name) VALUES (?,'feast',?) ON CONFLICT(id) DO NOTHING").run(id,entry.names.en);
      for (const [locale,name] of Object.entries(entry.names)) db.prepare("INSERT INTO calendar_geo_translations(id,entity_id,locale,name,translation_status,source_locale,source_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
        .run(`${id}:${locale}`,id,locale,name,locale==='en'?'source':'needs_review',locale,'oca-paschal-cycle');
    }
    for (const rule of rules) insert.run(rule.id,rule.type==='movable'?`feast:${rule.id.slice(8)}`:null,rule.title,rule.sourceId,rule.type,rule.month??null,rule.day??null,rule.anchor??null,rule.offsetDays??null,rule.type==='movable'?'verified':'needs_review');
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  const insertDay = db.prepare("INSERT INTO calendar_geo_days(civil_date,calendar_system,tradition,jurisdiction,resolved_at) VALUES (?,'julian','orthodox','',?) ON CONFLICT DO NOTHING");
  const insertOccurrence = db.prepare("INSERT INTO calendar_geo_occurrences(rule_id,civil_date,calendar_system,tradition,jurisdiction) VALUES (?,?,'julian','orthodox','') ON CONFLICT DO NOTHING");
  for (let index=0;index<resolved.length;index++) {
    const day=resolved[index];
    if (oldJob?.checkpoint && day.date<=oldJob.checkpoint) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      insertDay.run(day.date,now);
      for (const id of day.ids) insertOccurrence.run(id,day.date);
      db.prepare('UPDATE calendar_geo_import_jobs SET checkpoint=?,updated_at=? WHERE id=?').run(day.date,new Date().toISOString(),jobId);
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
    if ((index+1)%30===0 || index===resolved.length-1) console.log(`${index+1}/${resolved.length} ${day.date}`);
  }
  const integrity=db.prepare('PRAGMA integrity_check').all();
  const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
  if (integrity.some(row=>row.integrity_check!=='ok') || foreignKeys.length) throw new Error(`Integrity failed: ${JSON.stringify({integrity,foreignKeys})}`);
  const count=db.prepare("SELECT count(*) AS count FROM calendar_geo_days WHERE civil_date BETWEEN ? AND ? AND calendar_system='julian' AND tradition='orthodox' AND jurisdiction=''").get(dates[0],dates.at(-1));
  if(count.count!==dates.length) throw new Error('Incomplete year');
  db.prepare("UPDATE calendar_geo_import_jobs SET status='complete',updated_at=? WHERE id=?").run(new Date().toISOString(),jobId);
  console.log(JSON.stringify({localDatabase:candidates[0],resolvedDays:count.count,integrity:'ok',foreignKeys:'ok',stage:'RULES ONLY; entity reconciliation and enrichment pending'}));
} catch(error) {
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_import_jobs'").get()) {
    db.prepare("UPDATE calendar_geo_import_jobs SET status='failed',error=?,updated_at=? WHERE id=? AND source_hash=?")
      .run(String(error),new Date().toISOString(),`fixed-year:${year}:julian:orthodox`,hash);
  }
  throw error;
} finally {db.close();}
