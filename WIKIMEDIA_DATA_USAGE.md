# Wikimedia data usage

Policy review: 2026-09-19. Local enrichment is running; full-year coverage is
not yet complete.

## Sources

- Wikidata structured data: CC0. Retain QID, property, value, source URL and
  retrieval timestamp despite no mandatory CC0 attribution.
  https://www.wikidata.org/wiki/Wikidata:Licensing
- Wikipedia text: follow the applicable attribution/share-alike terms. Store
  only short extracts when needed, article/revision URL, locale and license.
  Internal verified translations take precedence. Never use Wikipedia to
  determine a church commemoration date.
  https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- Commons: each file has its own license. Save file page, author, license URL,
  attribution, retrieval time and modifications. Unknown license means no
  automatic display/import. Commons hosting alone is not sufficient evidence.
  https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia

## Implemented request policy

Read-only free Action API endpoints:
`https://www.wikidata.org/w/api.php`,
`https://{uk,ru,en}.wikipedia.org/w/api.php`,
`https://commons.wikimedia.org/w/api.php`.

Use an informative User-Agent with project contact URL. Requests serialized;
batch IDs where supported, maxlag=5, exponential backoff capped at 300 seconds
plus jitter, honor Retry-After and keep retrying transient overload. Do not
remove maxlag or weaken identity matching to bypass throttling.
Initial project throttle: at most one request/second, not a claimed official
universal limit. Service policies and responses take precedence.
Cache by endpoint/parameters, QID, locale/revision and Commons file identity;
persist retrieval dates, validators and resumable progress. The browser reads
our local database only, never these APIs at runtime.
https://www.mediawiki.org/wiki/API:Etiquette

## Calendar source distinction

Existing OCA fixed-calendar snapshot is reused locally. OCA is a church date
source, not Wikimedia and not assumed CC0. No full biographies copied.
Four movable feasts checked against https://www.oca.org/fs/paschal-cycle .
# Current local enrichment usage (2026-09-19)

Read-only Wikidata/Wikipedia/Commons requests have begun. They use a persistent
response cache, serialized requests, >=1-second adaptive spacing, maxlag=5,
unlimited transient retries and Retry-After handling. Repeated maxlag currently
delays completion; errors are never cached as empty results. A separate cooldown
record persists pacing across restarts. Negative responses expire after 30 days;
successful responses are reused. No bypass was introduced.
Only short Wikipedia introductions are retained, with source URLs and licensing.
Commons files with incomplete licensing remain needs_review (currently all 3).
Full articles and unapproved image downloads are not part of this pipeline.

Reviewed request-policy references:
- https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
- https://www.mediawiki.org/wiki/API:Etiquette
- https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
