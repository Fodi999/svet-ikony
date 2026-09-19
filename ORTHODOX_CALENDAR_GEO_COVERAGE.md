# Calendar geo coverage: 2026

## Current enrichment checkpoint: 2026-09-19

CALENDAR FOUNDATION ACCEPTED; ENRICHMENT INTENTIONALLY STOPPED by the user's
2026-09-19 instruction. Full-year enrichment is NOT a demo prerequisite.
This section supersedes the foundation snapshot below. Production D1/R2
unchanged; no deploy or push.

- Calendar resolution: 365/365 days, 2880 commemorations; 2028: 366/366.
- Identity profiles: 2907 (2880 source profiles + 27 existing translation groups).
  These are NOT unique canonical entities. Full-year unique counts remain unknown.
- Intermediate completed profiles: 136; machine_high 6, needs_review 37,
  not_found 93; pending 2771. Run coverage-local.mjs for live counters.
- Transient Wikimedia `maxlag` now retries indefinitely with persisted cooldown,
  jitter and Retry-After. It is NOT recorded as NO_MATCH. The full-year importer
  is stopped at 136 completed profiles; checkpoint, cache and reviews preserved.
- Current entity rows: 37 (33 saint, 4 feast); not a deduplicated full-year total.
- Wikidata-linked entities: 6; entities with geo: 5; editor-verified geo: 0.
- Places: 7; entity-place relations: 9; geographic days: 5/365 (1.37%).
  Remaining 360 days currently have no imported geography, not proof none exists.
- Translation rows across entities AND places: EN source 17; UK source 10,
  fallback 3, needs_review 4; RU source 10, fallback 3, needs_review 4.
  Full-year language percentages are not meaningful until canonical reconciliation.
- Commons records: 5 needs_review, 0 usable. None displayed without licensing clearance.
- Existing saint content links: 27; prayer links: 0. Existing biographies untouched.
- SQLite integrity_check=ok; foreign_key_check=0.

## Calendar-first local demo

All 365 dates verified through the local HTTP API, 2880 entries returned.
`/api/calendar/geo` now returns all day `entries` separately from geographic
`items`. `/api/calendar/entry/[ruleId]` opens entries without a canonical QID.
No network enrichment runs while reading dates or cards.

- 7 unique entity/place markers (9 typed relations), 5 geographic dates,
  360 zero-geo dates. Machine-matched geography is labelled, not editor-verified.
- Previous/next/input/Today, grouped day lists, entry cards and marker clicks.
- Dates tested in UK/RU/EN on desktop 1440x1000 and mobile 390x844:
  September 18 (8 entries, no geo), April 12 (Pascha, 13 entries), August 10
  (25 entries), January 21 (multiple places), January 14 (Basil marker).
- 25-date x 3-locale API audit also verifies list counts and entry cards.
- Browser checks: nonblank canvas, no JS errors or horizontal overflow;
  actual Cesium marker label click and Today passed.
- Missing translations fall back to source titles, not invented translations.
  Missing descriptions/images/prayers remain absent. Published explicitly
  linked internal content takes priority; alternative-language links keep
  their actual locale and slug. No name-based content matching.
- Categories for unlinked source titles are presentation-only, not identity
  matches. Unclassified commemorations remain visible under Events.

Screenshots: `/tmp/calendar-desktop-uk-2026-09-18.png`,
`/tmp/calendar-mobile-uk-2026-09-18.png`, `/tmp/calendar-marker-click.png`.

## Earlier integration verification

Geo/details API and separate OrthodoxCalendarLayer implemented locally.
Desktop 1440x1000 and mobile 390x844: date change, entity selection, details,
zero-geo day, nonblank canvas, no browser errors or horizontal overflow passed.
Screenshots: /tmp/calendar-geo-ui/desktop.png and mobile.png.
Admin queue: authenticated local list/detail, priority sorting and 14 filters.
Confirm/reject/QID preview/manual place/edit/remove/unknown/merge implemented.
Review provenance, human actor, rejection tombstones, stale-data guards and
idempotency are tested against SQLite and mocked authenticated BFF sessions.
Desktop/mobile fixture checks cover seven mutation actions. These are not a
real-editor authenticated end-to-end review of imported records.
API audit passed on 24 dates (20 seeded pseudorandom plus four special dates),
72 geo requests across UK/RU/EN and 6 details requests. Entity/place identities
remain stable across locales and returned coordinates are finite/in range.
Full-year Cesium acceptance and admin UI end-to-end acceptance remain open.

Site: typecheck PASS; lint PASS (35 warnings); 150 files / 1434 tests PASS;
OpenNext build PASS (222 JS syntax checks).
Admin: typecheck PASS; 91 files / 662 tests PASS, including queue local-only
authorization. Changed-file lint PASS. Full npm run lint FAIL: it includes
existing generated .open-next output (1827 errors in that run, including two
new review effect errors subsequently fixed and checked separately). No global
lint ignore was changed to conceal generated-output issues.
The tracked HEAD eslint config already excludes .next but not .open-next;
the admin .open-next directory predates this work (2026-09-16). This confirms
the generated-file scan predates these changes, not that every earlier lint
finding was pre-existing. Changed files are checked independently and pass.

Resume locally: `node scripts/calendar-geo/enrich-local.mjs --year=2026 --apply`.
This report does not certify completion of the requested pipeline.

Current language percentages use 37 stored canonical rows, not raw profiles:
UK native 10.81%, with fallback 16.22%; RU native 8.11%, with fallback 16.22%;
EN native/with fallback 27.03%. Places: UK native 85.71%, RU/EN native 100%;
all three locales have 100% with fallback for places.
Unknown geo among stored entities: 32/37. Unknown/unprocessed source identities
are reported separately rather than hidden in that denominator.
Metrics are counted since instrumented-client installation, not reconstructed
for older imports. `coverage-local.mjs` prints live cache/network/retry totals.

## Historical foundation snapshot

Local SQLite readback, 2026-09-19. FOUNDATION ONLY, not final acceptance.

| Measure | Actual |
| --- | ---: |
| Civil days resolved | 365/365 |
| Days with source commemorations | 365 |
| Days without source commemorations | 0 |
| Resolved occurrences | 2880 |
| Fixed source rules (includes February 29) | 2883 |
| Seeded movable rules | 4 |
| Canonical feast entities | 4 |
| Fixed rules awaiting identity reconciliation | 2883 |
| Places | 0 |
| Verified geographic relationships | 0 |
| Wikidata matched by this importer | 0 |
| Images imported | 0 |
| Lives/prayers linked by this importer | 0 |
| Cesium calendar days tested | 0 |

Unique saints/icons/events: NOT YET MEASURED. A source commemoration can name a
group or repeat a person, so source rule count is not a unique saint count.
Unknown geo: all current rules have no imported geographic relationship.
Wikidata candidate confidence/review counts: not yet measured, enrichment not run.

## Translations

Only four movable feast entities have translation rows: EN source titles;
UK/RU titles explicitly marked needs_review. Full native completeness and
with-fallback percentages are NOT YET MEASURED because identity reconciliation
and summaries are incomplete. No English source title is counted as UK/RU.

## Leap year and local integrity

2028: 366/366 civil days with source entries, 2887 resolved occurrences.
Civil February 29 is present. Julian February 29 resolves to March 13.
Repeat 2026 import retains 365 days/2880 occurrences (no duplicates).
SQLite integrity_check=ok; foreign_key_check has zero rows.
Pre-migration backup retained under .wrangler/calendar-geo-backups/.

## Checks

Typecheck PASS. Lint PASS (0 errors; 34 pre-existing warnings).
OpenNext build PASS; 219 client JavaScript files passed syntax checking.
Initial complete test run: one stale CSP rule-count expectation failed;
test now checks the three exact existing Cesium WASM exceptions and verifies
that the general site CSP remains unchanged. Final rerun: 140 files and 1405
tests PASS, including the new resolver and schema constraints.
Admin, geo API and Cesium calendar layer acceptance: NOT IMPLEMENTED/NOT RUN.

Production D1 UNTOUCHED. R2 UNTOUCHED. Deploy/push NOT EXECUTED.
