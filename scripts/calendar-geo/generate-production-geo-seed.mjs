// scripts/calendar-geo/generate-production-geo-seed.mjs
//
// Second-stage, geo-only production seed: transfers ONLY the local
// calendar_geo_* rows that already pass the exact same credibility filter
// lib/d1/repositories/calendarGeo.ts uses at read time (the same
// `credible` fragment: match_status IN ('machine_high','reviewed_verified')
// and geo_status IN ('machine_high','reviewed_verified') on
// entities/relations/places, plus valid lat/lon on places).
//
// This script is intentionally NOT a database client for any *remote*
// database:
//  - it holds no Cloudflare credentials of any kind,
//  - it never opens a connection to production D1,
//  - it opens the LOCAL D1 sqlite file strictly READ-ONLY (DatabaseSync
//    with {readOnly:true}) to read already-reviewed/machine-matched rows,
//  - it only writes a plain .sql text file.
//
// scripts/calendar-geo/import-local.mjs is read-only reference logic for
// the local-DB discovery pattern (single-candidate detection via the
// church_calendar_days table) and is never imported, executed, or
// modified by this script.
//
// Explicitly excluded from this seed (by construction of the WHERE
// clauses below, not by a separate filter step):
//  - entities/places/relations with match_status or geo_status of
//    'needs_review', 'not_found', 'reviewed_rejected', 'unknown', or
//    'manual_unverified'
//  - calendar_geo_candidates (unreviewed machine-matching candidates)
//  - calendar_geo_profiles / calendar_geo_http_cache (enrichment workflow
//    state, not finished data)
//  - calendar_geo_images (all locally in 'needs_review' status -- an
//    unfinished review state, so none currently qualify)
//  - any place without both lat and lon inside valid ranges
//
// Usage:
//   node scripts/calendar-geo/generate-production-geo-seed.mjs [--out=PATH]
//
// Output: an idempotent SQL file (INSERT ... ON CONFLICT DO NOTHING, plus
// guarded UPDATE ... WHERE entity_id IS NULL for the rule-to-entity links)
// suitable for `wrangler d1 execute <db> --remote --file=<PATH>`, which the
// operator must run themselves after reviewing the audit report below.

import {readFileSync, writeFileSync, readdirSync, realpathSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
for (const arg of args) {
  if (arg !== '--apply' && !/^--out=.+$/.test(arg)) {
    throw new Error(`Unrecognized argument: ${arg}. Only --out=PATH is accepted.`);
  }
  if (arg === '--apply') {
    throw new Error('This script never applies anything itself; --apply is not a valid option here.');
  }
}
const outPath = args.find(arg => arg.startsWith('--out='))?.slice(6) ?? '/tmp/calendar-geo-production-geo-2026.sql';

// Same local-only discovery pattern as import-local.mjs (read as reference,
// not imported): find the single local D1 sqlite by presence of the
// church_calendar_days table, and open it READ-ONLY. No write handle to
// the local DB is ever created by this script.
const state = realpathSync(join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'));
if (!state.startsWith(`${realpathSync(root)}/.wrangler/`)) throw new Error('Local database path escaped project');
const candidates = readdirSync(state).filter(name => /^[a-f0-9]{64}\.sqlite$/.test(name)).filter(name => {
  const path = realpathSync(join(state, name));
  if (dirname(path) !== state) throw new Error('Database symlink rejected');
  const db = new DatabaseSync(path, {readOnly: true});
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='church_calendar_days'").get()); }
  finally { db.close(); }
});
if (candidates.length !== 1) throw new Error(`Expected one existing local church database, found ${candidates.length}`);
const db = new DatabaseSync(join(state, candidates[0]), {readOnly: true});

const CREDIBLE_MATCH = "IN ('machine_high','reviewed_verified')";

const entityRows = db.prepare(`SELECT * FROM calendar_geo_entities WHERE match_status ${CREDIBLE_MATCH}`).all();
const entityIds = entityRows.map(r => r.id);

const placeRows = db.prepare(`SELECT * FROM calendar_geo_places WHERE match_status ${CREDIBLE_MATCH} AND geo_status ${CREDIBLE_MATCH} AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180`).all();
const placeIds = placeRows.map(r => r.id);

function inClause(ids) { return ids.length ? ids.map(() => '?').join(',') : 'NULL'; }

const relationRows = entityIds.length && placeIds.length ? db.prepare(
  `SELECT * FROM calendar_geo_relations WHERE entity_id IN (${inClause(entityIds)}) AND place_id IN (${inClause(placeIds)}) AND match_status ${CREDIBLE_MATCH} AND geo_status ${CREDIBLE_MATCH}`
).all(...entityIds, ...placeIds) : [];

const translationRows = db.prepare(
  `SELECT * FROM calendar_geo_translations WHERE entity_id IN (${inClause(entityIds)}) OR place_id IN (${inClause(placeIds)})`
).all(...entityIds, ...placeIds);

const provenanceRows = db.prepare(
  `SELECT * FROM calendar_geo_provenance WHERE entity_id IN (${inClause(entityIds)}) OR place_id IN (${inClause(placeIds)})`
).all(...entityIds, ...placeIds);

const neededSourceIds = [...new Set([
  ...relationRows.map(r => r.source_id),
  ...translationRows.map(r => r.source_id),
  ...provenanceRows.map(r => r.source_id),
].filter(Boolean))];

const sourceRows = neededSourceIds.length ? db.prepare(
  `SELECT * FROM calendar_geo_sources WHERE id IN (${inClause(neededSourceIds)})`
).all(...neededSourceIds) : [];

// Rules already linked (locally) to one of the qualifying entities. These
// become idempotent, non-clobbering UPDATEs on production.
const ruleLinks = entityIds.length ? db.prepare(
  `SELECT id, entity_id FROM calendar_geo_rules WHERE entity_id IN (${inClause(entityIds)})`
).all(...entityIds) : [];

db.close();

// ---- SQL emission (no DB access beyond the local read-only handle above) ----

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}
function insertStatement(table, row, conflictCols) {
  const cols = Object.keys(row);
  const values = cols.map(c => sqlValue(row[c]));
  const conflict = conflictCols ? `ON CONFLICT(${conflictCols}) DO NOTHING` : 'ON CONFLICT DO NOTHING';
  return `INSERT INTO ${table}(${cols.join(',')}) VALUES (${values.join(',')}) ${conflict};`;
}

const lines = [];
lines.push('-- Generated by scripts/calendar-geo/generate-production-geo-seed.mjs');
lines.push(`-- generatedAt=${new Date().toISOString()}`);
lines.push('-- Scope: only calendar_geo_entities/places/relations passing the exact');
lines.push("-- credible filter from lib/d1/repositories/calendarGeo.ts (match_status/geo_status");
lines.push('-- IN (machine_high, reviewed_verified), valid lat/lon), plus their translations,');
lines.push('-- provenance, and the sources those rows reference.');
lines.push('-- All statements are INSERT ... ON CONFLICT DO NOTHING or a guarded UPDATE');
lines.push('-- that only ever moves entity_id from NULL to a value (idempotent, safe to re-run).');
lines.push('-- No DELETE/DROP statements are present in this file.');
lines.push('');

lines.push(`-- calendar_geo_sources (${sourceRows.length})`);
for (const row of sourceRows) lines.push(insertStatement('calendar_geo_sources', row, 'id'));
lines.push('');

lines.push(`-- calendar_geo_entities (${entityRows.length})`);
for (const row of entityRows) lines.push(insertStatement('calendar_geo_entities', row, 'id'));
lines.push('');

lines.push(`-- calendar_geo_places (${placeRows.length})`);
for (const row of placeRows) lines.push(insertStatement('calendar_geo_places', row, 'id'));
lines.push('');

lines.push(`-- calendar_geo_relations (${relationRows.length})`);
for (const row of relationRows) lines.push(insertStatement('calendar_geo_relations', row, null));
lines.push('');

lines.push(`-- calendar_geo_translations (${translationRows.length})`);
for (const row of translationRows) lines.push(insertStatement('calendar_geo_translations', row, 'id'));
lines.push('');

lines.push(`-- calendar_geo_provenance (${provenanceRows.length})`);
for (const row of provenanceRows) lines.push(insertStatement('calendar_geo_provenance', row, 'id'));
lines.push('');

lines.push(`-- calendar_geo_rules.entity_id links (${ruleLinks.length}) -- only NULL -> value, never overwrites`);
for (const link of ruleLinks) {
  lines.push(`UPDATE calendar_geo_rules SET entity_id=${sqlValue(link.entity_id)} WHERE id=${sqlValue(link.id)} AND entity_id IS NULL;`);
}
lines.push('');

const sql = lines.join('\n');
writeFileSync(outPath, sql, 'utf8');
const sqlBytes = readFileSync(outPath);
const sqlHash = createHash('sha256').update(sqlBytes).digest('hex');

const statementLines = sql.split('\n').filter(line => /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(line));
const statementTypes = new Set(statementLines.map(line => line.trim().split(/\s+/)[0].toUpperCase()));

console.log(JSON.stringify({
  outPath,
  sqlFileBytes: sqlBytes.length,
  sqlFileSha256: sqlHash,
  counts: {
    sources: sourceRows.length,
    entities: entityRows.length,
    places: placeRows.length,
    relations: relationRows.length,
    translations: translationRows.length,
    provenance: provenanceRows.length,
    ruleLinks: ruleLinks.length,
  },
  entityIds,
  placeIds,
  statementTypesPresent: [...statementTypes],
  statementCount: statementLines.length,
}, null, 2));
