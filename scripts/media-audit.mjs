#!/usr/bin/env node
/**
 * Stage 2D, Step 12 — dry-run media URL audit. Read-only: scans the LOCAL
 * D1 sqlite file (the same one `next dev` uses) for every media field this
 * stage's Step 2 audit identified, and prints a migration manifest (one
 * entry per non-empty URL found) in the format Stage 2E's real migration
 * script will consume.
 *
 * Never downloads files, never writes to D1, never touches R2 (local or
 * production). Run it with:
 *
 *   node scripts/media-audit.mjs [path-to-sqlite-file]
 *
 * If no path is given, it looks for the standard local `wrangler`/Miniflare
 * D1 state directory relative to the project root.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const D1_STATE_DIR = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

function findLocalD1File() {
  if (!existsSync(D1_STATE_DIR)) return null;
  const sqliteFile = readdirSync(D1_STATE_DIR).find((f) => f.endsWith('.sqlite'));
  return sqliteFile ? join(D1_STATE_DIR, sqliteFile) : null;
}

function query(dbPath, sql) {
  const raw = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return raw ? JSON.parse(raw) : [];
}

/** module -> { table, idColumn, plainUrlColumns, jsonArrayColumns } — traced
 * 1:1 to the real D1 schema checked during Step 2 (see the Step 2 table in
 * the Stage 2D report; church_articles/church_gospel_readings/
 * church_calendar_days have no media columns at all and are intentionally
 * absent here). */
const TABLE_MEDIA_FIELDS = [
  { module: 'alphabet', table: 'church_alphabet_letters', plainUrlColumns: ['card_image_url', 'main_image_url'] },
  { module: 'prayers', table: 'church_prayers', plainUrlColumns: ['image_url', 'audio_url', 'qr_code_url', 'visualizer_image_url'] },
  { module: 'saints', table: 'church_saints', plainUrlColumns: ['image_url'] },
  { module: 'icons', table: 'church_icons', plainUrlColumns: ['image_url'] },
  { module: 'church_info', table: 'church_info', plainUrlColumns: ['image_url'], jsonArrayColumns: ['gallery_images'] },
  { module: 'categories', table: 'icon_product_categories', plainUrlColumns: ['image_url'] },
  { module: 'products', table: 'icon_order_options', plainUrlColumns: ['photo_url'], jsonArrayColumns: ['gallery_urls'] },
];

const LEGACY_HOST_HINTS = ['koyeb.app', 'product-images'];

function classifySourceUrl(url) {
  if (!/^https?:\/\//i.test(url)) return { sourceHost: null, dependsOnOldBackend: false, external: false, note: 'not an absolute URL — unexpected, needs manual review' };
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    return { sourceHost: null, dependsOnOldBackend: false, external: false, note: 'unparseable URL' };
  }
  const dependsOnOldBackend = LEGACY_HOST_HINTS.some((hint) => url.includes(hint));
  return { sourceHost: host, dependsOnOldBackend, external: !dependsOnOldBackend };
}

function guessContentType(url) {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg' };
  return (ext && map[ext]) || null;
}

function toManifestEntry({ url, table, entityId, field, module }) {
  const classification = classifySourceUrl(url);
  return {
    sourceUrl: url,
    table,
    entityId,
    field,
    targetKey: `media/${module}/${entityId}/${field.replace(/_url$/, '').replace(/_/g, '-')}/<uuid-to-assign-in-Stage-2E>.<ext>`,
    contentType: guessContentType(url),
    size: null,
    checksum: null,
    status: 'pending',
    ...classification,
  };
}

function main() {
  const dbPath = process.argv[2] || findLocalD1File();
  if (!dbPath || !existsSync(dbPath)) {
    console.error('No local D1 sqlite file found (and none given as an argument). Run `npm run dev` at least once first.');
    process.exitCode = 1;
    return;
  }

  const manifest = [];
  for (const { module, table, plainUrlColumns = [], jsonArrayColumns = [] } of TABLE_MEDIA_FIELDS) {
    for (const column of plainUrlColumns) {
      const rows = query(dbPath, `SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`);
      for (const row of rows) {
        manifest.push(toManifestEntry({ url: row.value, table, entityId: row.id, field: column, module }));
      }
    }
    for (const column of jsonArrayColumns) {
      const rows = query(dbPath, `SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != '' AND ${column} != '[]'`);
      for (const row of rows) {
        let urls = [];
        try {
          urls = JSON.parse(row.value);
        } catch {
          continue;
        }
        for (const url of urls) {
          manifest.push(toManifestEntry({ url, table, entityId: row.id, field: column, module }));
        }
      }
    }
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), source: dbPath, count: manifest.length, entries: manifest }, null, 2));
}

main();
