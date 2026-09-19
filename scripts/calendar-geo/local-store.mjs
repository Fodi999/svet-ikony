import {DatabaseSync,backup} from 'node:sqlite';
import {readdirSync,readFileSync,realpathSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export async function openLocalStore() {
  const state=realpathSync(join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject'));
  if(!state.startsWith(`${realpathSync(root)}/.wrangler/`))throw new Error('Database path escaped local state');
  const files=readdirSync(state).filter(name=>/^[a-f0-9]{64}\.sqlite$/.test(name)).filter(name=>{
    const path=realpathSync(join(state,name));
    if(dirname(path)!==state)throw new Error('Database symlink rejected');
    const probe=new DatabaseSync(path,{readOnly:true});
    try{return Boolean(probe.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_rules'").get());}
    finally{probe.close();}
  });
  if(files.length!==1)throw new Error('Expected exactly one local calendar database');
  const db=new DatabaseSync(join(state,files[0]));
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_profiles'").get()) {
      const dir=join(root,'.wrangler/calendar-geo-backups');mkdirSync(dir,{recursive:true});
      const path=join(dir,'before-calendar-geo-identity.sqlite');
      if(!existsSync(path))await backup(db,path);
      db.exec('BEGIN IMMEDIATE');
      try{
        db.exec(readFileSync(join(root,'migrations/0027_calendar_geo_identity.sql'),'utf8'));
        db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0027_calendar_geo_identity.sql');
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_stages'").get()) {
      const dir=join(root,'.wrangler/calendar-geo-backups');mkdirSync(dir,{recursive:true});
      const path=join(dir,'before-calendar-geo-workflow.sqlite');
      if(!existsSync(path))await backup(db,path);
      transaction(db,()=>{
        db.exec(readFileSync(join(root,'migrations/0028_calendar_geo_workflow.sql'),'utf8'));
        db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0028_calendar_geo_workflow.sql');
      });
    }
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_review_guard'").get())transaction(db,()=>{
      db.exec(readFileSync(join(root,'migrations/0029_calendar_geo_review_guard.sql'),'utf8'));
      db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0029_calendar_geo_review_guard.sql');
    });
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_revision'").get())transaction(db,()=>{
      db.exec(readFileSync(join(root,'migrations/0030_calendar_geo_revision.sql'),'utf8'));
      db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0030_calendar_geo_revision.sql');
    });
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='calendar_geo_pass_runs'").get())transaction(db,()=>{
      db.exec(readFileSync(join(root,'migrations/0031_calendar_geo_pass_runs.sql'),'utf8'));
      db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0031_calendar_geo_pass_runs.sql');
    });
    return db;
  }catch(error){db.close();throw error;}
}
export function transaction(db,fn) {
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
