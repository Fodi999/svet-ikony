import { getDb } from './env';
import { ApiError } from './errors';

/** Thin wrappers so route handlers read like the Rust `sqlx::query*` calls
 * they replace, with D1 errors surfaced as the same ApiError.database shape. */

export async function d1All<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  const db = await getDb();
  try {
    const { results } = await db.prepare(sql).bind(...params).all<T>();
    return results;
  } catch (error) {
    throw ApiError.database(error);
  }
}

export async function d1First<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null> {
  const db = await getDb();
  try {
    const row = await db.prepare(sql).bind(...params).first<T>();
    return row ?? null;
  } catch (error) {
    throw ApiError.database(error);
  }
}

/** Same as d1First, but a unique-constraint violation becomes 409 instead
 * of 500 — the D1 equivalent of church_orders.rs's `conflict_or_db_error`
 * (Postgres error code 23505), used only by the two tables whose Rust
 * handlers opt into that behavior (icon_product_categories, products). */
export async function d1FirstConflictAware<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null> {
  const db = await getDb();
  try {
    const row = await db.prepare(sql).bind(...params).first<T>();
    return row ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed/i.test(message)) {
      throw ApiError.conflict('slug already exists');
    }
    throw ApiError.database(error);
  }
}

export async function d1Run(sql: string, ...params: unknown[]): Promise<D1Result> {
  const db = await getDb();
  try {
    return await db.prepare(sql).bind(...params).run();
  } catch (error) {
    throw ApiError.database(error);
  }
}

/** Atomic multi-statement write — the D1 replacement for a Postgres
 * transaction. Every statement must already have all of its bound values
 * (no statement can depend on another's result — see mappers.ts genId()). */
export async function d1Batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
  const db = await getDb();
  try {
    return await db.batch(statements);
  } catch (error) {
    throw ApiError.database(error);
  }
}

export async function d1Prepare(sql: string, ...params: unknown[]): Promise<D1PreparedStatement> {
  const db = await getDb();
  return db.prepare(sql).bind(...params);
}
