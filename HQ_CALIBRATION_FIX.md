# HQ Earth calibration correction — 2026-09-10

The previous country-overlay report tested `earth_web_v3.glb`, not the standalone
HQ Earth now used in production. That omission left the HQ model uncalibrated.

Production currently serves `earth_web_hq.glb` (13,190,404 bytes). Its SHA-256
matches the user's local Earth_Globe asset exactly:
`9a2274e7352f8be4f7165b81b218b7ebad98e4af16054a2a388c16da6ca7b5ff`.

The v3 scene contains geographic marker nodes. HQ omits these nodes and instead
provides `Earth.extras.gltf_axes = "north +Y; Greenwich +X; longitude +90 -Z"`.
The loader previously only read the old anchors, so it left HQ at yaw 0 instead
of rotating it −90° into the public +Z Greenwich / +X east geographic frame.
That caused the visible 90° mismatch between texture and border coordinates.

The loader now recognizes this explicitly declared frame, including the Earth's
initial world rotation. Existing anchor-based calibration remains intact. It
does not infer orientation from filenames or change the GLB, textures, border
data, camera, schema or API contracts.

Localhost previously referenced the v3 test asset. The user's local screenshot
shows the built-in fallback (147 draw calls, radius 1.8), not another textured
Earth. At investigation time the v3 media URL returned HTTP 200; the screenshot
alone cannot establish why that browser instance had not loaded it. Local Base
Earth now points to the same HQ bytes as production, uploaded through the existing
local APIs. An explicit status now distinguishes model loading from failure when
the fallback is visible, including in the fullscreen explorer.

Validation:

- Typecheck passed; all 952 tests passed across 95 files.
- New regression tests cover anchor-free HQ axes, nonzero initial rotation, and
  unchanged behavior for generic uploads with no geographic metadata.
- Lint: zero errors, 24 existing warnings. OpenNext build passed.
- Actual HQ GLTF parsed for transform/UV validation (image decoding stubbed only
  for this CPU check). 15,615 vertices; maximum UV-derived angular discrepancy
  away from the longitude-ambiguous poles: 0.00001278° after calibration.
- Real Chrome localhost renders HQ textures with attached borders through model
  animation and pointer orbit. Americas and Australia/Indonesia coastlines align;
  the Pacific no longer shows displaced American borders. No console errors or
  warnings observed. HQ plus overlay uses 4 draw calls.
- Screenshot: `artifacts/geography/hq-calibration-fixed.png`.

These corrections are local and have not been committed, pushed or deployed.

## Follow-up: manual rotation only

Per the user's next request, the base model's embedded Earth/cloud animation is
no longer started, and the separate fallback globe auto-spin is removed.
OrbitControls drag/zoom remains active. Explicit event selection transitions and
event-specific model animations retain their existing behavior.

Typecheck and build passed; all 954 tests passed. Added regression coverage that
advances 120 idle frames for both the fallback and an animated GLB and verifies
that Earth, clouds and their parent transform remain unchanged. In real Chrome,
two canvas screenshots taken without interaction matched byte-for-byte; a mouse
drag then changed the rendered view. Screenshot: `artifacts/geography/hq-manual-rotation.png`.
