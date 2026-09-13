# Fixed calendar reference

`orthodox-fixed-calendar.json` is a bundled editorial reference for draft preparation,
keyed by Julian month/day (including February 29). It is not a full liturgical calendar.

Source: the Orthodox Church in America's publicly available dated Lives of the Saints
indexes. Each entry retains its source article ID and commemoration title. Long lives
and descriptions are deliberately not redistributed in this snapshot.

Collection: fetch each month/day for 2024 and 2020, extract only dated saint articles,
then retain IDs whose titles agree across both indexes. The years have different
Paschal dates; this screens out year-specific movable entries. This is a comparison
within ONE publisher, not independent two-source verification. Source URLs and retrieval
date are retained in the JSON. Review source changes before replacing the snapshot.

Usage: date-only AI preparation reads this snapshot without external calendar requests.
The AI may translate and summarize the supplied facts, but must not invent a biography,
fasting rules, movable feasts, or readings. The resulting content is a human-reviewed
draft. Existing linked-saint verification and publication permissions are unchanged.

Update validation: all 366 keys present, nonempty entries, unique IDs per day,
matching dated source URLs, and the calendar-date-reference regression tests.
