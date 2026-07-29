/**
 * D1/SQLite has no boolean, JSON, or array storage class — Postgres's sqlx
 * layer converted those transparently (see MIGRATION_PLAN.md §2 "PG types
 * used" / "D1 discrepancies"), so every read/write touching one of these
 * columns must go through here instead of ad hoc inline conversion. Missing
 * one of these at a random call site is exactly how a boolean silently
 * becomes the string `"0"` in a JSON response.
 */

/** JS boolean -> D1 INTEGER (0/1) for binding into a prepared statement. */
export function toD1Bool(value: boolean | undefined | null): number {
  return value ? 1 : 0;
}

/** D1 INTEGER (0/1, or SQLite's 0n/1n if ever returned as bigint) -> JS boolean. */
export function fromD1Bool(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

/** JS value -> D1 TEXT holding a JSON string, for jsonb/text[] columns. */
export function toD1Json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** D1 TEXT (JSON string) -> parsed JS value, with a safe fallback shape. */
export function fromD1Json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** RFC4122 v4 UUID, generated app-side. Needed whenever a single logical
 * operation writes related rows across more than one table in one D1
 * `batch()` — D1 batches can't chain one statement's RETURNING into the
 * next statement's parameters the way a Postgres transaction could, so the
 * id has to already be known before the batch is built (see
 * MIGRATION_PLAN.md's transactions row, and 09_icon_orders + order_number). */
export function genId(): string {
  return crypto.randomUUID();
}

/** This D1 database is svetikony-only (see 0001_svetikony_schema.sql header)
 * — every DTO shape below still carries `siteId`/`isGlobal` because
 * lib/types.ts and the Tauri admin's types mirror the Rust backend's wire
 * format exactly, and neither actually reads those two fields (grepped
 * both). Filling them with constants keeps the response byte-shape
 * unchanged instead of forcing a type/consumer sweep across three
 * codebases for columns nobody uses. */
export const SVETIKONY_SITE_ID = '00000000-0000-0000-0000-000000000101';
export const IS_GLOBAL_DEFAULT = false;

/** Mirrors church_orders.rs's `resolve_uuid_sentinel`: the update-payload
 * convention for nullable FK-ish string fields — key omitted (`undefined`)
 * means "don't touch", `""` means "clear to null", anything else is the new
 * value. A plain `payload.x ?? current.x` can't express "clear to null"
 * since `""` is truthy-enough to pass through unchanged; this is why that
 * shortcut only works for fields that don't support being cleared. */
export function resolveUuidSentinel(payloadValue: string | undefined, current: string | null): string | null {
  if (payloadValue === undefined) return current;
  const trimmed = payloadValue.trim();
  return trimmed === '' ? null : trimmed;
}
