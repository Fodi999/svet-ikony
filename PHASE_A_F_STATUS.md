# svet-ikony Earth publish pipeline — PHASE A–F status

Session-continuity note only. No secrets are stored here or anywhere in this
repo — credentials live exclusively in `~/.config/svet-ikony-earth/publish.env`
(outside the repo, never committed) and in Cloudflare's own secret store.

Repo: `/Users/dmitrijfomin/Desktop/svet-ikony` (work only in this repo — no
parallel repo, no rewrite of `lib/visualizer`).

## Architecture decision (binding)

Minimal plan on top of the EXISTING D1 + R2 stack. No separate
`earth/builds/vXXX/` + `latest.json` system was created or should be created.

Flow: Blender → GLB → `/api/admin/media/upload` → Cloudflare R2 →
`visualizer_models` (D1) → `is_base_earth` flag → `getBaseEarthModel()` →
`Earth3DCanvas`.

Preserved untouched throughout: R2 bucket `svetikony-media`, `MEDIA_BUCKET`
binding, `/media/*` delivery, D1 `visualizer_models` table, `is_base_earth`
as the active-version pointer, immutable UUID R2 keys, existing
load-then-swap client behavior, existing `GLTFLoader` pipeline,
`Earth3DCanvas.tsx`, `base-scene.ts`, `geography.ts`, terrain streaming,
markers, borders, historical territories, timeline. `MAX_MODEL_BYTES` (50MB,
`lib/media/constants.ts`) was not changed.

## PHASE A — Audit (done)

Full audit of the existing Earth/R2/D1/media architecture. No files changed.
Confirmed: `visualizer_models.is_base_earth` is the live-version pointer,
flipped atomically via `setBaseEarthModel()`
(`lib/d1/repositories/visualizerModels.ts`); upload flow is
`/api/admin/media/upload` (generic media, R2-only) +
`/api/admin/church-content/visualizer-models` (D1 metadata row, always
created with `isBaseEarth: false`) +
`.../{id}/set-base-earth` (the only mutator of the live pointer); admin auth
is a self-contained HS256 JWT (`lib/d1/auth.ts`, `role: 'super_admin'`,
`ADMIN_JWT_SECRET`/`JWT_SECRET`), not cookies.

## PHASE B — Contract (done)

Created `EARTH_ASSET_CONTRACT.md` (repo root). Defines: required object
name `Earth`; runtime radius 1.8 / diameter 3.6 (auto-normalized by
`prepareBaseScene()`); coordinate system north=+Y, Greenwich=+Z, east=+X;
two allowed orientation-calibration conventions — `gltf_axes` extras string
on the `Earth` node, or a legacy child node carrying a `longitude` extras
anchor (no calibration = hard export error); allowed special objects
(`Sun`, `Sun_Corona`, `Moon`, anything matching `/cloud|atmosphere/i`); GLB
v2, embedded-only resources (no external URIs — the loader/validator
forbids them), no Draco/KTX2/Meshopt; 50MB cap.

## PHASE C — Local preview (done)

- `app/api/dev/earth-preview/route.ts` — dev-only route, reuses
  `requireTerrainLocal()` (the same gate the terrain system already uses:
  runtime check on `NODE_ENV==='development'` AND request hostname, not
  just an env flag). Serves `tools/earth/export/earth.glb` from disk with
  `cache-control: no-store`. Clear 404 message when the file is missing.
- `app/pravoslavna-istoriya/page.tsx` — minimal branch:
  `EARTH_ASSET_MODE==='local'` (AND `NODE_ENV==='development'`) routes the
  Earth model URL to `/api/dev/earth-preview` instead of the real
  R2/D1-resolved URL. Production is unaffected regardless of a stray env
  var.
- `package.json`: `"earth:preview": "EARTH_ASSET_MODE=local next dev"`.
- `.gitignore`: added `tools/earth/export/` (verified via
  `git check-ignore -v`).
- `Earth3DCanvas.tsx`, `GLTFLoader`, `base-scene.ts`, `geography.ts`,
  terrain/markers/borders/timeline: untouched. The local GLB goes through
  the exact same runtime pipeline as the real R2 GLB.
- Verified: `npm run typecheck` clean; production OpenNext/Cloudflare build
  confirmed green by the user on their own machine (dev-only route present
  in the route map, doesn't break the Worker bundle).
- `npm test`/`next dev` could not be run from this assistant's sandboxed
  tool environment (Linux/aarch64 vs. the repo's macOS/darwin-arm64
  `node_modules`, and no path to `registry.npmjs.org` from either sandbox)
  — this is an environment limitation, not a code issue. The user has
  confirmed these pass on their own machine.

## PHASE D — `earth:publish` (done)

`scripts/earth/publish.mjs` (+ shared `scripts/earth/lib.mjs`, see Phase E).
Three-step flow, strictly sequential (each step needs the previous step's
response, so `set-base-earth` is structurally last and cannot run early):

1. `POST /api/admin/media/upload` (multipart, `module=visualizer`,
   `entityId=earth`, `purpose=model`) → R2 object.
2. `POST /api/admin/church-content/visualizer-models` (JSON, `r2Key` from
   step 1) → new D1 row (`isBaseEarth: false`, forced server-side).
3. `POST /api/admin/church-content/visualizer-models/{id}/set-base-earth`
   → atomically flips `is_base_earth` (D1 batch, already atomic
   server-side).

Auth: self-signed short-lived (5 min) `super_admin` JWT, same shape as
`scripts/visualizer/smoke.mjs` already uses, signed with
`ADMIN_JWT_SECRET`/`JWT_SECRET` read only from the process environment.
`--site-url`/`$SITE_URL` required explicitly for a real publish (never
defaults to production). `--dry-run` does zero network calls.
`package.json`: `"earth:publish": "node scripts/earth/publish.mjs"`.

**Phase F addition to this file** (see below): `--json` output mode, plus
an `EARTH_ASSET_CONTRACT.md` compliance check (Earth node present +
orientation calibration present) that now gates BOTH `--dry-run` and a
real publish — this is a deliberate behavior change beyond the original
Phase D scope, added because Phase F's "Validate Earth" button needs a
reliable PASS/FAIL "Contract result", and the CLI (not the Blender addon)
must remain the single source of truth for it.

## PHASE E — `earth:rollback` (done)

`scripts/earth/rollback.mjs` + `scripts/earth/lib.mjs` (auth/fetch helpers
shared with `publish.mjs`, extracted during this phase — `publish.mjs`'s
behavior was verified unchanged after the extraction).

- `--list`: read-only `GET` of all `visualizer_models`.
- `<model-id>`: `GET` to verify the id exists + report current vs. target,
  then (unless `--dry-run`, and only if the id actually differs from the
  current one) a single `POST .../set-base-earth`. No re-upload, ever.
`package.json`: `"earth:rollback": "node scripts/earth/rollback.mjs"`.

## PHASE F — Blender addon (in progress this session)

Decisions made (confirmed by the user):
- Credentials sourcing: a file OUTSIDE the repo,
  `~/.config/svet-ikony-earth/publish.env` (`SITE_URL=`,
  `ADMIN_JWT_SECRET=`), never in `.blend`/`.py`/addon preferences/git/CLI
  args/logs.
- UI form: an installable Blender addon (not a Text-datablock script),
  `tools/earth/blender/earth_publish_addon.py`.
- 4 operators: Export Earth, Validate Earth, Preview Earth, Publish Earth.
- Export Earth reads ONLY from a collection literally named `Earth_Export`
  (no name-guessing of objects) — must contain an object named `Earth`;
  missing collection/object is a clear error, nothing exported.
- Validate Earth = Export Earth + `npm run earth:publish -- --dry-run
  --json` (no credentials needed), parses the JSON `publish.mjs` now
  emits — the addon does NOT reimplement any validation itself.
- Preview Earth = Save + Export + Validate + (start `npm run
  earth:preview` only if localhost:3000 isn't already answering) + open
  `http://localhost:3000/pravoslavna-istoriya`. Never touches
  SITE_URL/ADMIN_JWT_SECRET/R2/D1.
- Publish Earth = Save + Export + Validate(`--dry-run`); only if PASS, read
  the credentials file, show a confirmation dialog (default = Cancel),
  then run `npm run earth:publish -- --json --site-url ... --title ...`
  with the secret passed only via the subprocess `env`, never as a CLI
  argument. Parses the JSON result for Model ID / R2 key / previous vs new
  Base Earth / Site.
- Addon preferences store only `project_dir` and `npm_path` — never
  `SITE_URL`/secret.
- Long-running steps must not block Blender's UI thread (non-blocking
  subprocess handling + modal/timer status polling, not a bare blocking
  `subprocess.run` in the operator's `execute()`).
- Credential file permission check: warn (not silently fail, never print
  the secret) if `~/.config/svet-ikony-earth/publish.env` is more open
  than mode 600.
- The addon must never talk to R2/D1 directly, never mint its own JWT,
  never duplicate `publish.mjs`'s validation logic, and must not touch
  `Earth_Tile_Manager_Script` or any Next.js runtime file.

Files for this phase: `tools/earth/blender/earth_publish_addon.py`,
`tools/earth/blender/publish.env.example`, `tools/earth/blender/README.md`.
No Next.js files change in this phase beyond what's already listed under
Phase D (the `--json` + contract-check addition to `publish.mjs`).

## Known non-blocking loose end

`next-env.d.ts` gets auto-rewritten (`./.next/types/routes.d.ts` ↔
`./.next/dev/types/routes.d.ts`) by some background `next`/`tsc` process on
this machine between sessions. It has been reverted via
`git checkout -- next-env.d.ts` every time it appeared dirty and is not
part of any Phase's actual change set — safe to ignore/revert again if it
reappears.

## What has NOT been done

- No real (non-dry-run) `earth:publish` has ever been executed against a
  real `SITE_URL` in this project — every verification so far used
  `--dry-run` and/or a synthetic throwaway GLB against `https://example.invalid`.
- `npm test` has not been run successfully from any environment available
  to this assistant (sandbox architecture / npm registry egress
  limitations, unrelated to the code). The user should run `npm test` and
  `npm run build` themselves to double-check after Phase F lands.
- PHASE F's Blender-side code has not been executed inside a real Blender
  process by this assistant (no Blender available in this session) —
  verified only via `python3 -m py_compile` and manual review. Real
  in-Blender testing is on the user.
