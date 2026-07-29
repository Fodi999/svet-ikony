# Postgres → D1 data migration: svetikony

Status: **schema inventory + scripts prepared, nothing imported yet.** Neon
(the Postgres host) is currently returning `Your account or project has
exceeded the compute time quota` on every connection attempt, so row counts
and the live `icon_order_number_seq` value below are unverified — everything
else comes from the 17 `church_*`/`icon_*`/`prayer_*` migrations in
`../../../assistant/migrations/`, the same source `0001_svetikony_schema.sql`
was built from.

## 1–2. Table inventory

12 of the 13 real Postgres tables feed a D1 table 1:1. `church_alphabet_letters`
is excluded (see §6). `icon_order_counters` has no Postgres table — it
replaces `SEQUENCE icon_order_number_seq`.

Legend: **PK** primary key · **UQ** unique constraint · **FK** foreign key ·
row counts marked `BLOCKED` need a live connection.

### church_calendar_days
- Rows: BLOCKED · PK: `id uuid` · UQ: none · FK: `site_id → sites(id)` (dropped in D1)
- PG types: `uuid, date×2, text×4, integer, boolean, timestamptz×2`
- D1 discrepancies: `site_id`/`is_global` dropped (filter becomes `WHERE site_id='...0101' OR is_global`); `uuid→text`; `date→text('YYYY-MM-DD')`; `timestamptz→text(ISO-8601 Z)`; `boolean→integer`

### icon_product_categories
- Rows: BLOCKED · PK: `id uuid` · UQ: `(site_id, slug)` → D1 `(slug)` · FK: `site_id → sites(id)` (dropped)
- PG types: `uuid, text×8, boolean, integer, timestamptz×2`
- D1 discrepancies: standard (site scoping dropped, uuid/timestamptz/boolean as above)

### church_icons
- Rows: BLOCKED · PK: `id uuid` · UQ: `(site_id, slug, language)` → D1 `(slug, language)`
- FK: `calendar_day_id → church_calendar_days(id) ON DELETE SET NULL`, `site_id → sites(id)` (dropped)
- PG types: `uuid×2, text×8, boolean×2, bigint(price_cents, nullable), timestamptz×2`
- D1 discrepancies: `bigint→integer` (D1 INTEGER is already 8-byte, no precision loss); rest standard

### icon_order_options
- Rows: BLOCKED · PK: `id uuid` · UQ: `(site_id, slug)` → D1 `(slug)`
- FK: `site_id → sites(id)` (dropped), `category_id → icon_product_categories(id) ON DELETE SET NULL`
- PG types: `uuid×3(1 nullable FK, 1 loose non-FK ref), text×15, bigint(price_cents), boolean×3, integer, text[](gallery_urls), timestamptz×2`
- D1 discrepancies: `text[]→text(JSON array)`; `linked_icon_translation_group_id` was never an enforced FK in Postgres either (no unique index on `church_icons.translation_group_id` to reference) — stays a loose UUID reference in D1 too

### church_prayers
- Rows: BLOCKED · PK: `id uuid` · UQ: `(site_id, slug, language)` → D1 `(slug, language)`
- FK: `icon_id → church_icons(id) SET NULL`, `calendar_day_id → church_calendar_days(id) SET NULL`, `site_id → sites(id)` (dropped)
- PG types: `uuid×3, text×12, boolean×2, integer×2, real×2, jsonb×2, timestamptz×2`
- D1 discrepancies: `jsonb→text(JSON string)`; rest standard

### church_articles / church_gospel_readings / church_saints
- Rows: BLOCKED (all three) · PK: `id uuid` · UQ: `(site_id, slug, language)` → D1 `(slug, language)`
- FK: `icon_id → church_icons(id) SET NULL`, `calendar_day_id → church_calendar_days(id) SET NULL`, `site_id → sites(id)` (dropped)
- PG types: mostly `uuid×3, text, boolean, timestamptz×2` (`church_saints` adds a 4th uuid: `translation_group_id`)
- D1 discrepancies: standard only. **`church_saints` has no `updated_at` trigger in Postgres either** — carried into D1 as-is, not a migration gap

### icon_orders
- Rows: BLOCKED · PK: `id uuid` · UQ: `order_number`
- FK: `icon_id → church_icons(id) SET NULL`, `primary_product_id → icon_order_options(id) SET NULL`, `site_id → sites(id)` (dropped)
- PG types: `uuid×3, text×11, boolean×3, bigint×2, timestamptz×2`
- D1 discrepancies: standard. `order_number` itself (`'IK-000123'`) is plain text — no format change, only how *future* numbers get generated changes (see §5)

### icon_order_items
- Rows: BLOCKED · PK: `id uuid` · UQ: none · FK: `order_id → icon_orders(id) ON DELETE CASCADE`, `option_id → icon_order_options(id) SET NULL`
- PG types: `uuid×3, text, bigint, integer, timestamptz`
- No `site_id` of its own in Postgres either — always scoped transitively through `order_id`. D1 discrepancies: standard only

### church_prayer_visualizer_assets
- Rows: BLOCKED · PK: `id uuid` · UQ: `prayer_id` · FK: `prayer_id → church_prayers(id) ON DELETE CASCADE`
- PG types: `uuid×2, text×6, integer×4, timestamptz×2`
- No `site_id` of its own — scoped transitively through `prayer_id`. D1 discrepancies: standard only

### church_info
- Rows: BLOCKED (expected: 0 or 1 — singleton per site) · PK: `id uuid` · UQ: `site_id` (enforces "at most one row per site"; **not replicated in D1**, see schema header) · FK: `site_id → sites(id)` (dropped)
- PG types: `uuid, text×5, jsonb, text[], text, timestamptz×2`
- D1 discrepancies: `jsonb→text`, `text[]→text(JSON array)`; singleton-ness becomes an application-level convention instead of a DB constraint

### icon_order_counters (no Postgres table)
- Postgres equivalent: `SEQUENCE icon_order_number_seq`, advanced by `nextval()` on every new order
- Current value: BLOCKED (needs `SELECT last_value FROM icon_order_number_seq`)
- Handled separately from the row-copy scripts — see §5

## 3. Safe transfer order (FK-respecting)

```
1.  church_calendar_days        (no FK deps within this set)
2.  icon_product_categories     (no FK deps within this set)
3.  church_icons                 → calendar_day_id
4.  icon_order_options            → category_id
5.  church_prayers                → icon_id, calendar_day_id
6.  church_articles               → icon_id, calendar_day_id
7.  church_gospel_readings        → icon_id, calendar_day_id
8.  church_saints                 → icon_id, calendar_day_id
9.  icon_orders                   → icon_id, primary_product_id
10. icon_order_items              → order_id, option_id
11. church_prayer_visualizer_assets → prayer_id
12. church_info                 (standalone, order doesn't matter)
--  church_alphabet_letters     SKIPPED — already seeded (§6)
99. icon_order_counters update  (after icon_orders, see §5)
```
`tables.mjs` encodes this via the `order` field; both scripts sort by it automatically.

## 4. Export / import scripts (prepared, not run)

```
scripts/d1-migration/
├── tables.mjs                 shared column/type/filter map (single source of truth)
├── export-from-postgres.mjs   Postgres → export/<table>.jsonl (read-only COPY ... TO STDOUT)
├── import-to-d1.mjs           export/*.jsonl → import-sql/NN_<table>.sql (batched INSERTs)
└── MIGRATION_PLAN.md          this file
```

Usage once Postgres is reachable again:
```bash
DATABASE_URL='postgresql://...' node scripts/d1-migration/export-from-postgres.mjs
node scripts/d1-migration/import-to-d1.mjs
# inspect scripts/d1-migration/import-sql/*.sql, diff row counts against the
# export log, THEN and only then:
for f in scripts/d1-migration/import-sql/*.sql; do
  npx wrangler d1 execute svetikony-production --local --file="$f"
done
```
`--remote` is a conscious separate step, not part of this script — run it by
hand, table by table, after the `--local` result has been checked.

The generation logic was validated against synthetic fixtures covering every
column type in play (NULL-through-nullable-FK, boolean→0/1, JSONB, `text[]`,
embedded single quotes, UUID/timestamp passthrough) — applied to a local
SQLite copy of `0001_svetikony_schema.sql` and read back byte-for-byte
correct. It has **not** been run against real data yet.

## 5. id / slug / translation_group_id / timestamps / NULL

All preserved unchanged for every row-copy table:
- `id`, `translation_group_id`, and every FK (`icon_id`, `calendar_day_id`,
  `category_id`, `option_id`, `order_id`, `prayer_id`, `primary_product_id`)
  are copied as the exact same UUID string Postgres already has — required,
  since these are the values every FK relationship depends on.
- `slug` copied verbatim.
- `timestamptz` re-formatted to UTC `YYYY-MM-DDTHH:MM:SS.sssZ` text (same
  instant, same convention D1's own `strftime` defaults use — not a value
  change, a representation change forced by SQLite having no timestamp type).
- Postgres `NULL` → D1 `NULL` via `row_to_json()` (never coerced to `''`/`0`).

One value that is **not** preserved as-is: `icon_orders.order_number`. Its
*existing* values (`'IK-000123'`) copy over unchanged like any other text
column. What changes is how the *next* one gets minted — Postgres used
`nextval('icon_order_number_seq')`, D1 uses `icon_order_counters`
(§9 of `0001_svetikony_schema.sql`). `99_icon_order_counters.sql` seeds that
counter from the live sequence's `last_value` at export time, specifically so
the first D1-issued order number continues right after the last Postgres one
instead of restarting from 1 and colliding with history.

## 6. church_alphabet_letters — do not blindly re-import

`0002_alphabet_seed.sql` already put all 138 rows into D1, transcribed
mechanically from the *migration file's* seed SQL, not from a live Postgres
read. Consequence: **the `id` and `translation_group_id` values in D1 do not
match the live Postgres row ids for this table** (each side generated its own
random UUIDs independently). This is harmless *today* because nothing else
has an FK to `church_alphabet_letters` — grepped the Rust codebase, confirmed
zero references. Two ways forward, pick one before cutover:
- **Leave it** — D1's alphabet content already matches Postgres's content
  (same 46 letters × 3 languages, same text), just under different ids. Fine
  as long as nothing external ever hardcodes one of those ids.
- **Re-import for real** — export `church_alphabet_letters` from Postgres like
  every other table and `DELETE FROM church_alphabet_letters; ` + re-insert
  with real ids first. Only worth doing if id stability across the two
  databases turns out to matter.

## 7. Known incompatibilities / risks

- **Neon compute quota exhausted** (current blocker) — every number in §2
  marked BLOCKED, and `icon_order_counters` seeding in §5, need this resolved
  first. Not something I can fix from here.
- **`church_info` singleton constraint not enforced in D1** — Postgres used
  `UNIQUE(site_id)` to guarantee at most one row; single-tenant D1 has no
  such column to key that constraint on. If Postgres somehow has >1 row (it
  shouldn't, but unverified while blocked), the import needs a manual
  decision about which one wins instead of silently taking both.
- **`ON CONFLICT DO NOTHING` (no target) in the generated INSERTs** — relies
  on SQLite matching against *any* violated constraint (PK or the table's
  UNIQUE). Verified working with the alphabet seed's `(slug, language)`
  constraint; not yet verified against every table's actual constraint shape
  with real duplicate data, since Postgres is unreachable.
- **Large batches previously caused `parser stack overflow`** in D1's SQLite
  parser (hit this with the original 138-row alphabet CTE). Mitigated by
  batching every INSERT at 15 rows, same size already proven safe — but
  untested at true production volume for wide tables like `icon_order_options`
  (28 columns); worth re-verifying batch size once real row counts are known.
- **PII in `icon_orders`/`icon_order_items`** — `customer_name`,
  `contact_value`, `client_ip`, address fields. `export/` and `import-sql/`
  are gitignored; do not paste their contents into chat, tickets, or logs.
- **No dry-run against real data yet** — the transform logic is validated
  against hand-built fixtures covering every type, not against actual
  Postgres output. First real export should be spot-checked (row counts per
  table vs. a manual `SELECT count(*)` per table) before trusting the bulk
  `--remote` apply.
