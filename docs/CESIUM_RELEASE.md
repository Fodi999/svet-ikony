# Cesium production release

User explicitly authorized production publication and git push, accepting that
the prototype has not reached the original full migration acceptance gate.
This is a reversible prototype release, not a declaration of feature parity.

## Assets

- Runtime: @cesium/engine 26.3.0; copied at build time to
  `/cesium-runtime/26.3.0/` from the installed package.
- Data release: `88542551e4ab2763a5a7ddbdd45cce619badf84e9027756d66551cc8fe0a03d1`.
- 1399 terrain/imagery files; 55,817,936 bytes.
- R2 bucket: `svetikony-media`; isolated `cesium/releases/<release>/` prefix.
- Each object is put conditionally without replacement, then downloaded and
  verified against SHA-256. READY.json is written only after all checks pass.
- Public read-only route: `/cesium/<release>/<dataset>/<asset>`.
- No D1 schema or content changes are required.

## Reproduction

Prepare local data using scripts/terrain/cesium-base.py, cesium-alps.py and
cesium-quantized.py. They use existing local caches; they do not upload sources.
Run `node scripts/terrain/cesium-release.mjs` for a local manifest/dry-run.
Explicit upload: `node scripts/terrain/cesium-release.mjs --upload --bucket svetikony-media`.
Authentication is handled by Wrangler; tokens are not copied into scripts.
`npm run build` prepares static runtime files and builds the OpenNext Worker.

## Rollback

The production page defaults to Cesium. `?engine=three` selects the retained
Three renderer for immediate per-page fallback. Redeploy the preceding Worker
version for a site-wide rollback. Immutable release objects can remain in R2;
rollback does not require deleting data or changing D1.
Pre-release Worker version: `a97de776-af6c-45ea-9411-955ad19166bd`.

## Known limitations

- Pale diagonal artifact over Mont Blanc awaits terrain/border diagnosis.
- Full A/B benchmarks, physical iPhone acceptance, 10m oblique clearance and
  complete history/model visual parity are not certified.
- Mont Blanc coverage is limited; this is not a complete Alps migration.
- Legacy Three code remains because the acceptance/cleanup gate is not met and
  prayer visualization independently uses Three.

Verification before release: 138 test files / 1397 tests passed. OpenNext build
passed; no production database migration was run. Publication/readback status
must be confirmed by the deployment output and live requests, not this plan.
