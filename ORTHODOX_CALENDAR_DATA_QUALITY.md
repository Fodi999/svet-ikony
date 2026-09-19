# Calendar data quality: open work

## Calendar-first scope (2026-09-19)

365/365 calendar days and 2880 commemorations are accepted. The local demo
opens every occurrence regardless of QID or coordinates. Bulk enrichment
is intentionally stopped at 136/2907; missing geography and translations
are optional future work, NOT a blocker for the calendar. Checkpoint/cache,
sources, identities, relations and all review decisions are preserved.
UK/RU/EN interface support does not imply complete translated source content.

## Enrichment checkpoint (supersedes foundation notes below)

Intermediate checkpoint: 136/2907 profiles complete; 6 machine_high,
37 needs_review, 93 not_found. Run coverage-local.mjs for live counts.
No editor verification was fabricated. Source profiles are not unique saints.
66 duplicate normalized-name groups are intentionally NOT auto-merged.
Examples include seven Afterfeast of Theophany and seven Afterfeast of Dormition
source titles: repeated commemorations are not seven separate people.

Identity matching tests cover identical names without corroboration, conflicting
dates, group-versus-individual mismatch, multiple HIGH candidates and explicit
source identity references. Exact OCA identity URLs may corroborate a candidate;
shared day-page URLs cannot. Confidence evidence is stored for review.

Current Basil of Caesarea geography uses Wikidata Kayseri coordinates with
Wikidata statement provenance, not guessed ancient-site coordinates. This is
city-level evidence, NOT a verified exact historical birthplace. Historical and
modern equivalence still needs editorial context. Constantinople/Istanbul is
not automatically substituted by string matching.

UK and RU each have three fallback rows across entities and places;
fallback is excluded from native/source coverage. Four feast translations in
each language remain needs_review. All five Commons files remain needs_review.

Repeated Wikimedia maxlag leaves the affected profile retryable, not NO_MATCH.
The full-year canonical count, complete geo coverage and remaining identity
ambiguities are unresolved. API/Cesium and admin mutation workflows are
implemented; full-year enrichment is deferred. See the separate 20-profile
NO_MATCH audit in ORTHODOX_CALENDAR_MATCH_AUDIT.md. A search miss is not evidence
that no Wikidata entity exists. Alias discovery never lowers the HIGH threshold.

## Historical foundation notes

This report explicitly does not certify the requested full geo-calendar.

- 2883 source commemoration rules await canonical identity reconciliation.
  Do not equate the OCA commemoration identifier with a unique individual QID.
  Group commemorations and repeated memories need explicit entity relations.
- Existing snapshot is an intersection of two source years. This is useful
  evidence for fixed dates, not independent confirmation or universal
  jurisdiction coverage. Rules remain needs_review.
- Only Pascha, Palm Sunday, Ascension and Pentecost are seeded as movable
  rules. The full movable cycle and year-specific commemorations remain open.
- No unsupported coordinates, country centroids or guessed churches inserted.
  There are zero new places and zero new geographic relationships.
- No Wikidata searches/candidate assessments have been executed in this stage.
  Ambiguous-match, duplicate-candidate and conflicting-date totals are unknown,
  not zero. No automatic identity merge by name has been performed.
- Four feast entities have EN source names and UK/RU names awaiting review;
  missing summaries, native translations and images remain unresolved.
- Existing lives/prayers/gospel links remain unchanged; reconciliation pending.
- Calendar system is not tradition: Julian fixed rules and Orthodox Pascha
  are explicit. Revised Julian, leap-memory transfer and jurisdiction policies
  need verified rules before claiming universal Orthodox coverage.
- UI/API/admin work has not been implemented by this foundation stage.

The importer completes the calendar-rule stage even with unresolved identity
and geography. Its job status 'complete' applies to fixed-year resolution ONLY,
not enrichment, editorial review, translation completeness or UI acceptance.
