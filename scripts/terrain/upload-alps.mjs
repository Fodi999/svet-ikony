#!/usr/bin/env node
/**
 * Uploads tools/terrain/alps/build/{manifest.json,*.glb} to the LOCAL
 * dev-only terrain-bundles admin API (lib/terrain/http.ts's
 * requireTerrainLocal gate: only works against a `next dev` server on
 * localhost -- a deployed/production Worker refuses this route entirely).
 * This writes into R2 under the isolated `terrain/alps/L1/` prefix, which
 * production never reads (the public /terrain/* route is dev-only too).
 * Reuses scripts/earth/lib.mjs's auth/fetch helpers -- same pattern as
 * earth:publish, no separate credential path.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintAdminToken, requireAdminSecret, requireSiteUrl, apiCall } from '../earth/lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '../../tools/terrain/alps/build');

function parseArgs(argv) {
  const args = { dryRun: false, siteUrl: process.env.SITE_URL };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--site-url') args.siteUrl = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const region = manifest.region, lod = manifest.grid.lod;
  console.log(`Region: ${region}  LOD: ${lod}  Tiles: ${manifest.tiles.length}  Total: ${(manifest.total_glb_bytes / 1e6).toFixed(2)} MB`);

  if (args.dryRun) {
    console.log('DRY RUN: манифест прочитан локально, мережевих викликів не було. R2 не змінювався.');
    console.log('Було б виконано:');
    console.log(`  1. POST /api/admin/terrain-bundles/${region}/${lod}  (begin, вбудований манифест)`);
    for (const t of manifest.tiles) console.log(`  2. PUT  /api/admin/terrain-bundles/${region}/${lod}/tiles/${t.x}_${t.y}  (${t.file}, ${(t.file_size_bytes/1024).toFixed(0)} KB)`);
    console.log(`  3. POST /api/admin/terrain-bundles/${region}/${lod}/reconcile`);
    return;
  }

  const siteUrl = requireSiteUrl(args.siteUrl);
  const secret = requireAdminSecret();
  const token = mintAdminToken(secret);

  console.log('1/3 begin...');
  const begin = await apiCall(siteUrl, token, `/api/admin/terrain-bundles/${region}/${lod}`, 'POST', manifest);
  const bundleId = begin.bundleId;
  if (!bundleId) throw new Error('begin() did not return a bundleId: ' + JSON.stringify(begin));
  console.log('   bundleId:', bundleId, ' state:', begin.state);

  console.log(`2/3 uploading ${manifest.tiles.length} tiles...`);
  for (const tile of manifest.tiles) {
    const bytes = await readFile(path.join(BUILD_DIR, tile.file));
    const response = await fetch(new URL(`/api/admin/terrain-bundles/${region}/${lod}/tiles/${tile.x}_${tile.y}`, siteUrl), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'model/gltf-binary', 'x-terrain-bundle-id': bundleId },
      body: bytes,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`PUT tile ${tile.tile_id} -> ${response.status}: ${text.slice(0, 300)}`);
    console.log(`   ${tile.tile_id} (${tile.file}) OK`);
  }

  console.log('3/3 reconcile...');
  const finalStatus = await (async () => {
    const response = await fetch(new URL(`/api/admin/terrain-bundles/${region}/${lod}/reconcile`, siteUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-terrain-bundle-id': bundleId },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`reconcile -> ${response.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  })();

  console.log('\nDone.');
  console.log('  state:', finalStatus.state, ' complete:', finalStatus.complete, ' verifiedAll:', finalStatus.verifiedAll);
  console.log('  manifestKey:', finalStatus.manifestKey);
  console.log(`\nManifest served locally at: ${siteUrl}/terrain/${region}/L${lod}/manifest.json (dev-only, localhost гейт)`);
}

main().catch((error) => {
  console.error('Помилка:', error.message);
  process.exit(1);
});
