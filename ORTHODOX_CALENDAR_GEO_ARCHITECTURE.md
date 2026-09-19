# Orthodox calendar geography: local implementation status

## Scope and safety

LOCAL ONLY. No production migration, R2 write, deployment or git push.
Calendar foundation, enrichment, review and map integration are implemented;
full-year enrichment is intentionally STOPPED at the user's request.
All-day calendar lists are independent of optional geographic markers.
Entry cards address stable rule IDs and need no canonical QID.
Additive migrations 0026..0031 leave
legacy editorial tables unchanged.

## Implemented

- Calendar rules -> resolved occurrences -> optional canonical entity.
- A civil-day table distinguishes resolved empty days from missing imports.
- Entity/place identities are language-independent; translations have explicit
  verified/source/fallback/needs_review states and a source locale.
- Places, typed many-to-many relations, field provenance and QID candidates.
- Links to existing editorial translation groups, without copying lives/prayers.
- Julian/Gregorian fixed rules, specific civil dates, Julian Pascha offsets.
- Calendar system, tradition and jurisdiction are separate dimensions.
- Resolver supports years 1583..4099; unsupported ranges fail explicitly.
- Node 24 local importer: dry-run default, explicit --apply, database-path guard,
  SQLite backup, daily transactions/checkpoints, stable keys and source hash.
- Local source snapshot has 366 month/day buckets. Source commemorations remain
  rules with unresolved entity links, not fabricated individual saints.

## Commands

`node scripts/calendar-geo/import-local.mjs --year=2026`

`node scripts/calendar-geo/import-local.mjs --year=2026 --apply`

There is no remote mode. Uses only the existing project's .wrangler SQLite D1
state. Requires one unambiguous church database. Backups are in ignored
`.wrangler/calendar-geo-backups/`. It does not invoke Wrangler or read credentials.

## Calendar policy

Current import: orthodox, Julian fixed calendar, unspecified jurisdiction.
Four movable feasts are seeded from OCA's paschal cycle; this is NOT the complete
movable cycle or a lectionary. No February-29 transfer policy is invented.
Year 2028 has both a civil February 29 and Julian February 29 (civil March 13).
Gregorian fixed-date rules are supported but not seeded by this import.
Revised Julian rules and jurisdiction-specific transfers are not implemented.

The legacy public calendar falls back to comparing an old-style stored date to
the requested civil string. Telegram explicitly converts civil to Julian first.
The new resolver is explicit and does not change either production caller.
Moving those callers requires separate regression validation.

## Remaining acceptance and data work

- Reconcile source commemorations with canonical identities, including groups
  and repeat commemorations; never merge by name alone.
- Finish the running year-wide Wikidata/Wikipedia/Commons enrichment.
- Complete movable-cycle coverage and existing editorial-content linking.
- Repeat local API and desktop/mobile Cesium acceptance on the completed dataset.
- Human editorial review is separate from automated import completion.

Future traditions reuse places and canonical identities; new calendar rules
must not reuse Orthodox Pascha implicitly for Catholic calendars.
# Local enrichment extension, 2026-09-19

Migration 0027 adds source identity profiles, candidates, persistent Wikimedia
cache, image licensing state and review audit storage. Import scripts under
scripts/calendar-geo operate only on the project's local .wrangler SQLite.
Machine HIGH and editor verification are distinct. Partial progress survives
upstream failures. An importer completion is not claimed while profiles remain.

Local-only geo/details APIs feed a separate OrthodoxCalendarLayer, with date,
category filtering, related places and a localized card. The admin project has
a development-only authenticated Calendar Geo Review workflow. Its BFF rejects
non-loopback upstreams BEFORE session resolution; no production fallback.
Confirm, reject, QID preview, manual/edit place, relation removal, unknown geo
and merge are implemented. POST requires a real editor/super-admin session;
reviewer identity comes from the server session, never the request body.
Migrations 0028..0030 add per-stage checkpoints, metrics, separate geo statuses,
canonical redirects and transactional review guards. A graph revision guards
against concurrent importer writes; merge additionally requires a fresh preview
hash. Rejections persist as tombstones. Conflicting translations remain archived
on the source entity; provenance, content links and occurrences are retained.

Wikimedia requests are serial, start at one-second spacing and back off up to
15-second spacing on overload. Transient retries are unlimited, with 5-second
exponential backoff capped at 300 seconds plus jitter, honoring Retry-After.
Cooldown and cache survive restart. Successful entity data are batched with all
three locales; place country/administrative QIDs are resolved without geocoding.
Matching, entity, Wikipedia, places, coordinates, Commons and persistence have
separate statuses. Earlier successful stages survive later failures.

Tests run against in-memory SQLite and local API/Playwright fixtures. The admin
desktop/mobile seven-action fixture test is NOT an authenticated production or
real-editor end-to-end test. No editorial verification is inferred from tests.
