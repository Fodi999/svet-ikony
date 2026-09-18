#!/usr/bin/env node
/**
 * earth:publish -- Phase D (+ Phase F additions). Publishes a locally
 * Blender-exported Earth GLB (see EARTH_ASSET_CONTRACT.md) using the
 * EXISTING media/visualizer_models architecture -- no separate R2
 * versioning system, no latest.json/manifest.json:
 *
 *   1. POST /api/admin/media/upload -> R2 object (module=visualizer, purpose=model)
 *   2. POST /api/admin/church-content/visualizer-models -> new D1 row
 *      (isBaseEarth=false, forced server-side)
 *   3. POST /api/admin/church-content/visualizer-models/{id}/set-base-earth
 *      -> atomically flips the live pointer
 *
 * Step 3 only ever runs after steps 1 and 2 have both returned successfully
 * -- it literally needs the `id` step 2 returns, so there is no code path
 * that reaches it early, and any non-2xx response aborts the whole run
 * before it.
 *
 * Auth: mirrors the same self-signed super_admin JWT pattern already used
 * by scripts/visualizer/smoke.mjs (HS256, {sub, role, iat, exp}, signed
 * with ADMIN_JWT_SECRET/JWT_SECRET) -- this CLI is just another trusted
 * backend caller of svet-ikony's own /api/admin/** surface, same as the
 * existing admin BFF. The secret is read ONLY from the process
 * environment, never from a file this script writes or reads.
 *
 * This script is the single source of truth for "is this GLB publishable"
 * -- the Blender addon (tools/earth/blender/) calls it via subprocess for
 * both Validate Earth (--dry-run --json) and Publish Earth (--json), and
 * deliberately does NOT reimplement any of these checks itself; it only
 * parses this script's --json output.
 *
 * Usage:
 *   ADMIN_JWT_SECRET=... SITE_URL=https://svetikony.com \
 *     npm run earth:publish -- --dry-run
 *   ADMIN_JWT_SECRET=... npm run earth:publish -- --site-url https://svetikony.com --title "Earth v3"
 *
 * Flags:
 *   --file <path>      Defaults to tools/earth/export/earth.glb (the same
 *                      file `npm run earth:preview` serves -- what you saw
 *                      in preview is exactly what gets published).
 *   --site-url <url>   Target origin. Falls back to $SITE_URL. Required
 *                      for a real publish -- no implicit default, so a run
 *                      never silently guesses production. Not required
 *                      for --dry-run.
 *   --title <string>   visualizer_models.title. Defaults to
 *                      "Base Earth Model — <ISO timestamp>".
 *   --dry-run          Validates + reports locally. Zero network calls.
 *                      Never touches R2 or D1. Does not require
 *                      ADMIN_JWT_SECRET/--site-url.
 *   --json             Emit a single JSON object to stdout instead of the
 *                      human-readable report (same information either
 *                      way). Meant for programmatic callers (the Blender
 *                      addon); manual CLI usage keeps the readable default.
 *
 * Requires ADMIN_JWT_SECRET (or JWT_SECRET) in the environment for a real
 * (non---dry-run) publish.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mintAdminToken, requireAdminSecret, requireSiteUrl, apiCall } from './lib.mjs';

// Mirrors lib/media/constants.ts (MAX_MODEL_BYTES) and lib/media/glb.ts
// (validateGlb) -- duplicated, not imported, because this is a plain Node
// script with no bundler/path-alias resolution, exactly like
// scripts/visualizer/smoke.mjs already duplicates lib/d1/auth.ts's token
// shape instead of importing it. The server re-validates authoritatively
// regardless -- this is only a fast local fail-fast check.
const MAX_MODEL_BYTES = 50 * 1024 * 1024;

/** Structural GLB v2 validation (mirrors lib/media/glb.ts's validateGlb
 * exactly). Returns the parsed glTF JSON chunk on success so the caller
 * can also inspect the scene graph (Earth node / orientation calibration,
 * see inspectContract() below) without re-parsing it. */
function validateGlbLocally(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('Файл має бути коректною GLB-моделлю версії 2');
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 || 20 + jsonLength > buffer.byteLength) {
    throw new Error('Некоректний JSON-блок GLB');
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)));
  } catch { throw new Error('Некоректний JSON у GLB'); }
  if (data?.asset?.version !== '2.0') throw new Error('Підтримується glTF 2.0');
  if ((data.buffers && !Array.isArray(data.buffers)) || (data.images && !Array.isArray(data.images))) {
    throw new Error('Некоректні ресурси GLB');
  }
  for (const resource of [...(data.buffers ?? []), ...(data.images ?? [])]) {
    if (!resource || (resource.uri !== undefined && typeof resource.uri !== 'string')) throw new Error('Некоректний ресурс GLB');
    if (resource.uri && !resource.uri.startsWith('data:')) {
      throw new Error('Експортуйте GLB з вбудованими текстурами та ресурсами (зовнішні файли не підтримуються)');
    }
  }
  let offset = 20 + jsonLength;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('Неповний GLB-блок');
    const length = view.getUint32(offset, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw new Error('Некоректна довжина GLB-блоку');
    offset += 8 + length;
  }
  return data;
}

/**
 * EARTH_ASSET_CONTRACT.md compliance, on top of raw GLB validity: a node
 * literally named "Earth" must exist, and it must carry one of the two
 * allowed orientation-calibration conventions (a `gltf_axes` extras string
 * on the Earth node itself, or a descendant node carrying a legacy
 * `longitude` extras anchor) -- "no calibration = yaw 0, treated as a hard
 * export error" per the contract. This is intentionally checked here, not
 * in the Blender addon, so there is exactly one place that decides
 * publishability.
 */
function inspectContract(glTFJson) {
  const nodes = Array.isArray(glTFJson.nodes) ? glTFJson.nodes : [];
  const earthIndex = nodes.findIndex((node) => node?.name === 'Earth');
  const earthNodePresent = earthIndex !== -1;

  let orientation = 'missing';
  if (earthNodePresent) {
    const earthNode = nodes[earthIndex];
    if (typeof earthNode?.extras?.gltf_axes === 'string' && earthNode.extras.gltf_axes.trim()) {
      orientation = 'gltf_axes';
    } else {
      // Legacy convention: walk descendants of the Earth node looking for
      // a child carrying a numeric `longitude` extras anchor.
      const visited = new Set();
      const queue = Array.isArray(earthNode?.children) ? [...earthNode.children] : [];
      while (queue.length && orientation === 'missing') {
        const index = queue.shift();
        if (visited.has(index) || !nodes[index]) continue;
        visited.add(index);
        const node = nodes[index];
        if (typeof node?.extras?.longitude === 'number') { orientation = 'legacy-longitude'; break; }
        if (Array.isArray(node.children)) queue.push(...node.children);
      }
    }
  }

  const contractResult = earthNodePresent && orientation !== 'missing' ? 'PASS' : 'FAIL';
  return { earthNodePresent, orientation, contractResult };
}

function printHelp() {
  console.log(`Usage: npm run earth:publish -- [--dry-run] [--json] [--file <path>] [--site-url <url>] [--title <string>]

  --file <path>     Path to the GLB to publish (default: tools/earth/export/earth.glb)
  --site-url <url>  Target site origin (default: $SITE_URL env var). Required for a real publish.
  --title <string>  visualizer_models.title (default: "Base Earth Model — <timestamp>")
  --dry-run         Validate locally only. No network calls. R2/D1 untouched.
  --json            Emit a single JSON report line instead of human-readable text.

Requires ADMIN_JWT_SECRET (or JWT_SECRET) in the environment for a real publish -- never read from a file.`);
}

function parseArgs(argv) {
  const args = { file: 'tools/earth/export/earth.glb', siteUrl: process.env.SITE_URL, title: undefined, dryRun: false, json: false };
  const needsValue = new Set(['--file', '--site-url', '--title']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { args.dryRun = true; continue; }
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0); }
    if (needsValue.has(arg)) {
      const value = argv[++i];
      if (value === undefined) { console.error(`${arg} потребує значення`); process.exit(1); }
      if (arg === '--file') args.file = value;
      else if (arg === '--site-url') args.siteUrl = value;
      else if (arg === '--title') args.title = value;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    printHelp();
    process.exit(1);
  }
  return args;
}

// Accumulated across main() so the top-level catch can still emit a
// meaningful --json report (with whatever fields were computed before the
// failure) instead of only a bare error string.
const partial = { ok: false };

function emitAndExit(result, exitCode) {
  if (result.json) {
    const { json, ...rest } = result;
    console.log(JSON.stringify(rest));
  }
  process.exit(exitCode);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  partial.json = args.json;
  partial.mode = args.dryRun ? 'dry-run' : 'publish';

  const filePath = path.resolve(process.cwd(), args.file);
  partial.file = filePath;
  let fileBuffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const message = `GLB не знайдено: ${filePath}\nЕкспортуйте Earth з Blender у цей шлях (див. EARTH_ASSET_CONTRACT.md).`;
      partial.error = message;
      if (!args.json) console.error(message);
      emitAndExit(partial, 1);
      return;
    }
    throw error;
  }

  if (fileBuffer.byteLength === 0) {
    partial.error = 'Файл порожній.';
    if (!args.json) console.error(partial.error);
    emitAndExit(partial, 1);
    return;
  }
  partial.size = fileBuffer.byteLength;
  if (fileBuffer.byteLength > MAX_MODEL_BYTES) {
    partial.error = `Файл перевищує ліміт: ${fileBuffer.byteLength} > ${MAX_MODEL_BYTES} bytes (MAX_MODEL_BYTES, lib/media/constants.ts).`;
    if (!args.json) console.error(partial.error);
    emitAndExit(partial, 1);
    return;
  }

  const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
  let glTFJson;
  try {
    glTFJson = validateGlbLocally(arrayBuffer);
  } catch (error) {
    partial.error = `GLB не пройшов локальну валідацію: ${error.message}`;
    partial.glbValid = false;
    if (!args.json) console.error(partial.error);
    emitAndExit(partial, 1);
    return;
  }
  partial.glbValid = true;

  const { earthNodePresent, orientation, contractResult } = inspectContract(glTFJson);
  Object.assign(partial, { earthNodePresent, orientation, contractResult });

  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
  const title = args.title || `Base Earth Model — ${new Date().toISOString()}`;
  Object.assign(partial, { sha256, title, siteUrl: args.siteUrl ?? null });

  if (!args.json) {
    console.log(`Файл:              ${filePath}`);
    console.log(`Розмір:            ${fileBuffer.byteLength} bytes`);
    console.log(`SHA-256:           ${sha256}`);
    console.log(`Title:             ${title}`);
    console.log(`GLB v2:            OK (embedded-only resources)`);
    console.log(`Earth node:        ${earthNodePresent ? 'OK' : 'MISSING'}`);
    console.log(`Orientation:       ${orientation}`);
    console.log(`Contract result:   ${contractResult}`);
  }

  if (contractResult !== 'PASS') {
    partial.ok = false;
    partial.error = 'EARTH_ASSET_CONTRACT.md: об\'єкт "Earth" відсутній або не має каліброваної орієнтації (gltf_axes / legacy longitude anchor).';
    if (!args.json) console.error(`\n${partial.error}`);
    emitAndExit(partial, 1);
    return;
  }

  if (args.dryRun) {
    partial.ok = true;
    if (!args.json) {
      console.log(`\nDRY RUN: мережевих викликів не було. R2 та D1 не змінювались.`);
      console.log(`Було б виконано (у цьому порядку):`);
      console.log(`  1. POST /api/admin/media/upload        (module=visualizer, entityId=earth, purpose=model)`);
      console.log(`  2. POST /api/admin/church-content/visualizer-models   (r2Key з кроку 1, title="${title}")`);
      console.log(`  3. POST /api/admin/church-content/visualizer-models/{id}/set-base-earth`);
      console.log(args.siteUrl ? `  Target: ${args.siteUrl}` : `  (--site-url/$SITE_URL не задано -- у реальному запуску знадобиться)`);
    }
    emitAndExit(partial, 0);
    return;
  }

  const siteUrl = requireSiteUrl(args.siteUrl);
  partial.siteUrl = siteUrl;
  const secret = requireAdminSecret();
  const token = mintAdminToken(secret);

  if (!args.json) console.log(`\nPublishing to ${siteUrl} ...`);

  const form = new FormData();
  form.set('file', new File([fileBuffer], 'earth.glb', { type: 'model/gltf-binary' }));
  form.set('module', 'visualizer');
  form.set('entityId', 'earth');
  form.set('purpose', 'model');
  const uploaded = await apiCall(siteUrl, token, '/api/admin/media/upload', 'POST', form);
  partial.r2Key = uploaded.key;
  partial.modelUrl = uploaded.url;
  if (!args.json) console.log(`  [1/3] Uploaded to R2: ${uploaded.key} (${uploaded.size} bytes)`);

  const model = await apiCall(siteUrl, token, '/api/admin/church-content/visualizer-models', 'POST', {
    r2Key: uploaded.key,
    title,
    eventGroupId: null,
  });
  partial.modelId = model.id;
  if (!args.json) console.log(`  [2/3] Created visualizer_models row: ${model.id}`);

  // Snapshot "previous" immediately before the swap, not earlier -- this
  // is what set-base-earth is about to displace.
  const modelsBeforeSwitch = await apiCall(siteUrl, token, '/api/admin/church-content/visualizer-models', 'GET');
  const previousBaseEarth = modelsBeforeSwitch.find((entry) => entry.isBaseEarth) ?? null;
  partial.previousBaseEarthId = previousBaseEarth?.id ?? null;
  partial.previousBaseEarthTitle = previousBaseEarth?.title ?? null;

  await apiCall(siteUrl, token, `/api/admin/church-content/visualizer-models/${model.id}/set-base-earth`, 'POST');
  partial.ok = true;
  if (!args.json) {
    console.log(`  [3/3] is_base_earth switched to ${model.id}`);
    console.log(`\nPublished successfully`);
    console.log(`Model ID:          ${model.id}`);
    console.log(`R2 key:            ${uploaded.key}`);
    console.log(`Previous Base Earth: ${previousBaseEarth ? `${previousBaseEarth.id} (${previousBaseEarth.title || '(без назви)'})` : '(none)'}`);
    console.log(`New Base Earth:    ${model.id} (${title})`);
    console.log(`Site:              ${siteUrl}`);
  }
  emitAndExit(partial, 0);
}

main().catch((error) => {
  partial.ok = false;
  partial.error = partial.error || error.message;
  if (!partial.json) console.error(`\nПублікація перервана: ${error.message}`);
  emitAndExit(partial, 1);
});
