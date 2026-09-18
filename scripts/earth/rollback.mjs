#!/usr/bin/env node
/**
 * earth:rollback -- Phase E. Switches the live Base Earth Model back to an
 * already-uploaded visualizer_models row, WITHOUT re-uploading anything.
 * Reuses the exact same set-base-earth endpoint earth:publish's final step
 * calls -- rollback and publish both end in the identical atomic pointer
 * flip (lib/d1/repositories/visualizerModels.ts's setBaseEarthModel()); the
 * only difference is rollback never touches R2 or POSTs to /media/upload.
 *
 *   --list              GET  /api/admin/church-content/visualizer-models
 *                        Read-only. Prints every model (id/title/isBaseEarth/
 *                        createdAt) so you know which <model-id> to pass.
 *   <model-id>           GET  /api/admin/church-content/visualizer-models/{id}
 *                        Verifies the id exists first -- a clear error
 *                        instead of a bare 404, and reports which model is
 *                        currently active before doing anything.
 *                        POST /api/admin/church-content/visualizer-models/{id}/set-base-earth
 *                        The only call that actually changes state.
 *
 * Usage:
 *   ADMIN_JWT_SECRET=... SITE_URL=https://svetikony.com \
 *     npm run earth:rollback -- --list
 *   ADMIN_JWT_SECRET=... npm run earth:rollback -- <model-id> --site-url https://svetikony.com [--dry-run]
 *
 * Requires ADMIN_JWT_SECRET (or JWT_SECRET) in the environment -- never
 * read from a file.
 */
import { mintAdminToken, requireAdminSecret, requireSiteUrl, apiCall } from './lib.mjs';

function printHelp() {
  console.log(`Usage:
  npm run earth:rollback -- --list [--site-url <url>]
  npm run earth:rollback -- <model-id> [--site-url <url>] [--dry-run]

  --list            Read-only: list existing visualizer_models (id/title/isBaseEarth/createdAt).
  <model-id>        The visualizer_models.id to make the live Base Earth Model again. No re-upload.
  --site-url <url>  Target site origin (default: $SITE_URL env var). Required.
  --dry-run         Verify the id exists and report what would happen. No set-base-earth call.

Requires ADMIN_JWT_SECRET (or JWT_SECRET) in the environment -- never read from a file.`);
}

function parseArgs(argv) {
  const args = { modelId: undefined, siteUrl: process.env.SITE_URL, dryRun: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') { args.list = true; continue; }
    if (arg === '--dry-run') { args.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0); }
    if (arg === '--site-url') {
      const value = argv[++i];
      if (value === undefined) { console.error('--site-url потребує значення'); process.exit(1); }
      args.siteUrl = value;
      continue;
    }
    if (arg.startsWith('--')) {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
    if (args.modelId !== undefined) {
      console.error(`Unexpected extra argument: ${arg}`);
      process.exit(1);
    }
    args.modelId = arg;
  }
  return args;
}

function printModelsTable(models) {
  if (models.length === 0) { console.log('(немає жодної visualizer_models моделі)'); return; }
  for (const model of models) {
    const marker = model.isBaseEarth ? '*' : ' ';
    console.log(`${marker} ${model.id}  ${model.createdAt}  ${model.title || '(без назви)'}`);
  }
  console.log('\n(* -- поточна активна Base Earth Model)');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.list && !args.modelId) {
    console.error('Потрібен <model-id> або --list.');
    printHelp();
    process.exit(1);
  }

  const siteUrl = requireSiteUrl(args.siteUrl);
  const secret = requireAdminSecret();
  const token = mintAdminToken(secret);

  if (args.list) {
    const models = await apiCall(siteUrl, token, '/api/admin/church-content/visualizer-models', 'GET');
    printModelsTable(models);
    return;
  }

  // Verify the id exists (and report what's currently active) before
  // touching anything -- getVisualizerModel() 404s cleanly server-side,
  // but this gives a clear message and a "before" snapshot up front rather
  // than surfacing that 404 only after also fetching the full list.
  const target = await apiCall(siteUrl, token, `/api/admin/church-content/visualizer-models/${args.modelId}`, 'GET');

  const allModels = await apiCall(siteUrl, token, '/api/admin/church-content/visualizer-models', 'GET');
  const current = allModels.find((model) => model.isBaseEarth);

  console.log(`Поточна активна Base Earth Model: ${current ? `${current.id} (${current.title || '(без назви)'})` : '(немає)'}`);
  console.log(`Буде активна:                     ${target.id} (${target.title || '(без назви)'})`);

  if (current && current.id === target.id) {
    console.log('\nВже активна -- set-base-earth не потрібен.');
    return;
  }

  if (args.dryRun) {
    console.log('\nDRY RUN: set-base-earth не викликано. R2 та D1 не змінювались.');
    return;
  }

  await apiCall(siteUrl, token, `/api/admin/church-content/visualizer-models/${target.id}/set-base-earth`, 'POST');
  console.log(`\nDone. is_base_earth перемкнуто на ${target.id}.`);
}

main().catch((error) => {
  console.error(`\nRollback перервано: ${error.message}`);
  process.exit(1);
});
