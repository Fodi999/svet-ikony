# Identity/profile audit, 2026-09-19

## 2907 versus 2880

The importer has 2880 calendar-rule input profiles and 27 existing internal
translation-group profiles. All 27 legacy rows are UK, each with its own existing
translation_group_id. There are no added RU/EN profile copies, place profiles,
duplicate rule-profile links or duplicate non-null canonical Wikidata IDs.
Profiles are unresolved inputs, NOT a claim of 2907 unique saints. A canonical
entity is language independent; several rules may eventually link to one QID.
Existing groups were not guessed or blindly merged. Legacy saints also contain
feasts and groups: an editor must review type, not infer sainthood from the table.

## Twenty NO_MATCH samples

All twenty have cached successful search responses with zero candidates. They
did not fail the HIGH confidence threshold: candidate retrieval returned none.
This establishes neither absence in Wikidata nor a unique historical identity.
The table identifies observable search problems, not fabricated alternate names.

| Existing name | Observable search issue |
| --- | --- |
| Апостол Тадей з числа сімдесяти | UK name plus ecclesiastical epithet |
| Свято Положення пояса Пресвятої Богородиці | Feast stored in legacy saints |
| Велика мучениця Євфимія Всехвальна | UK title not previously stripped |
| Священномученик Корнилій сотник | UK ecclesiastical form |
| Чудо Архістратига Михаїла, що в Хонех | Event; comma truncation lost location |
| Преподобний Симеон Стовпник Старший | Title and differentiating epithet |
| Свято Різдва Пресвятої Богородиці | Feast, not an individual |
| Святий пророк Мойсей Боговидець | Multiple titles plus epithet |
| Мученики Адріан і Наталія Нікомидійські | Group, must not match one human |
| Великомученик Никита Готський | Honorific previously not stripped |
| Свято Воздвиження Чесного і Животворящого Хреста Господнього | Long feast title |
| Святі і праведні Богоотці Йоаким та Анна | Group detection missing in old regex |
| Мучениці Менодора, Митродора і Нимфодора | Group; old comma truncation |
| Святителі Олександр, Іоан Постник і Павло Новий, патріархи Константинопольські | Group; old comma truncation |
| Святі пророк Захарія та праведна Єлисавета | Group detection missing in old regex |
| Мучениця Софія та дочки її Віра, Надія і Любов | Family group; old comma truncation |
| Мученик Агафоник Нікомидійський | UK ecclesiastical form |
| Передсвято Різдва Пресвятої Богородиці | Calendar after/forefeast, not an individual |
| The Circumcision of our Lord and Savior Jesus Christ | Long feast title |
| Icon of the Mother of God “You are a Vineyard” (Georgian: Shen khar venakhi) | Long icon title with attested alternate form |

Primary structural categories: six group commemorations, six feasts/events,
four UK ecclesiastical forms, three title/epithet cases, one icon title.
These categories are not confirmed explanations of Wikidata coverage.
No transliteration/Latin/Greek names were invented. Search now tries exact names,
mechanically stripped titles, then existing alternate names/aliases. Group
commas are retained by the new strategy and plural identities cannot receive a
HIGH human match. Source language is used when known rather than guessed.
Already completed version-2 profiles retain their checkpoints; the audit does
not silently rerun or relabel the 79 previously completed profiles.

Reproduce evidence: `node scripts/calendar-geo/audit-local.mjs`.

## Wikimedia behavior

User-Agent: SvetIkonyCalendarGeo/1.0 (https://svetikony.com).
Serial requests, 1s minimum spacing, adaptive slowdown to 15s, maxlag=5,
exponential backoff capped at 300s plus positive jitter; Retry-After remains a
minimum. Temporary maxlag/429/502/503/504/timeouts no longer stop the client.
Nonretryable HTTP/API failures remain distinct. Success and negative responses
are persisted; negative TTL is 30 days and cacheVersion is explicit. Errors
are not saved as successful empty results. Individual QID cache supports batches
and all three requested Wikidata languages in one request.

Observed live diagnosis: HTTP 200, error.code=maxlag,
type=wikibase-queryservice, Retry-After=5, Age=0, cache pass.
This is fresh upstream query-service lag, not a stale local browser cache.

References: [Maxlag](https://www.mediawiki.org/wiki/Manual:Maxlag_parameter),
[API etiquette](https://www.mediawiki.org/wiki/API:Etiquette),
[User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy).
