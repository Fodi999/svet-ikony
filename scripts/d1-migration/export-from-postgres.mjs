#!/usr/bin/env node
// Exports the svetikony subset of each Postgres table (from tables.mjs) as
// newline-delimited JSON into ./export/<table>.jsonl, one row per line.
//
// NOT wired to run automatically anywhere — invoke by hand once Postgres is
// reachable:
//   DATABASE_URL=postgresql://... node scripts/d1-migration/export-from-postgres.mjs
//
// Read-only: every query is a plain SELECT wrapped in `COPY (...) TO STDOUT`.
// Nothing here writes to Postgres.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TABLES } from './tables.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join(__dirname, 'export');

function projectColumn([name, type]) {
  switch (type) {
    case 'timestamptz':
      // Force UTC + the same 'YYYY-MM-DDTHH:MI:SS.MSZ' shape used by the D1
      // schema's own strftime() defaults, so imported rows are indistinguishable
      // from rows D1 generated itself.
      return `to_char(${name} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${name}`;
    case 'date':
      return `to_char(${name}, 'YYYY-MM-DD') AS ${name}`;
    default:
      // uuid/text/int/real/bool/jsonb/textarray all serialize fine as-is —
      // row_to_json() renders jsonb inline and TEXT[] as a JSON array.
      return name;
  }
}

function buildQuery(table) {
  const projected = table.columns.map(projectColumn).join(', ');
  const inner = `SELECT ${projected} FROM ${table.name} WHERE ${table.filter} ORDER BY id`;
  // row_to_json() keeps NULLs as JSON null (never coerced to "" or 0) and
  // keeps every value individually typed, which a plain CSV COPY would not.
  return `COPY (SELECT row_to_json(t) FROM (${inner}) t) TO STDOUT`;
}

function exportTable(table) {
  const sql = buildQuery(table);
  const result = spawnSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0) {
    throw new Error(`export failed for ${table.name}:\n${result.stderr}`);
  }
  const outPath = path.join(EXPORT_DIR, `${table.name}.jsonl`);
  writeFileSync(outPath, result.stdout);
  const rowCount = result.stdout.trim() === '' ? 0 : result.stdout.trim().split('\n').length;
  console.log(`${table.name.padEnd(32)} ${String(rowCount).padStart(6)} rows -> ${path.relative(process.cwd(), outPath)}`);
}

function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  mkdirSync(EXPORT_DIR, { recursive: true });
  for (const table of [...TABLES].sort((a, b) => a.order - b.order)) {
    exportTable(table);
  }

  // The one thing that isn't a table row: the live position of the Postgres
  // sequence backing icon_orders.order_number, needed to seed D1's
  // icon_order_counters.next_value so post-cutover order numbers don't
  // collide with historical ones.
  const seqResult = spawnSync(
    'psql',
    [process.env.DATABASE_URL, '-t', '-A', '-c', "SELECT last_value FROM icon_order_number_seq"],
    { encoding: 'utf8' }
  );
  if (seqResult.status === 0) {
    const value = seqResult.stdout.trim();
    writeFileSync(path.join(EXPORT_DIR, 'icon_order_number_seq.txt'), value + '\n');
    console.log(`${'icon_order_number_seq'.padEnd(32)} ${value.padStart(6)}      -> export/icon_order_number_seq.txt`);
  } else {
    console.error('warning: could not read icon_order_number_seq:', seqResult.stderr);
  }
}

main();
